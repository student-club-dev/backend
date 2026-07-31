import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  PRESENCE_REPOSITORY,
  PresenceRepository,
} from '../../../infrastructure/presence/presence.repository';
import { CONNECTIONS_REPOSITORY, ConnectionsRepository } from '../domain/connections.repository';
import { Connection } from '../domain/entities/connection.entity';
import { StudentSummary } from '../domain/entities/student-summary.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';
import { ConnectionView } from '../domain/enums/connection-view.enum';
import { applyPresenceVisibility } from '../domain/presence-visibility';
import {
  STUDENT_DIRECTORY,
  StudentDirectoryRepository,
  StudentSort,
} from '../domain/student-directory.repository';
import {
  BlockedListItem,
  ConnectionListItem,
  Page,
  RequestListItem,
  SearchResult,
  StudentListQuery,
} from './connections.io';

/** After a decline, this long must pass before the same pair may re-request (C10 anti-spam). */
const DECLINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Connection use-cases (LinkedIn-style, docs/architecture/chat.md C1/C11). Students-only; the caller
 * id is the JWT `sub`. Depends on repository interfaces only. Per-request rate-limiting is a
 * `@Throttle` on the controller; the decline cooldown (C10) lives here.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(CONNECTIONS_REPOSITORY) private readonly connections: ConnectionsRepository,
    @Inject(STUDENT_DIRECTORY) private readonly directory: StudentDirectoryRepository,
    @Inject(PRESENCE_REPOSITORY) private readonly presence: PresenceRepository,
  ) {}

  /**
   * Sends a connection request. Rejects self / unknown / blocked; if the addressee already has a
   * pending request to the caller, this auto-accepts it (C1 reverse shortcut). A prior DECLINED edge
   * is cleared and a fresh PENDING one created.
   */
  async sendRequest(user: AuthenticatedUser, addresseeId: string): Promise<Connection> {
    if (addresseeId === user.id) {
      throw new AppException(
        ERROR_CODE.CANNOT_CONNECT_SELF,
        422,
        "O'zingizga so'rov yubora olmaysiz",
      );
    }
    if (!(await this.directory.exists(addresseeId))) {
      throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
    }
    if (await this.connections.isBlockedEitherWay(user.id, addresseeId)) {
      throw new AppException(
        ERROR_CODE.USER_BLOCKED,
        403,
        "Bu foydalanuvchi bilan bog'lanib bo'lmaydi",
      );
    }

    const edge = await this.connections.findEdge(user.id, addresseeId);
    if (edge?.status === ConnectionStatus.ACCEPTED) {
      throw AppException.conflict(ERROR_CODE.ALREADY_CONNECTED, "Siz allaqachon bog'langansiz");
    }
    if (edge?.status === ConnectionStatus.PENDING) {
      if (edge.requesterId === user.id) {
        throw AppException.conflict(
          ERROR_CODE.CONNECTION_REQUEST_EXISTS,
          "So'rov allaqachon yuborilgan",
        );
      }
      // reverse pending — they already requested the caller → auto-accept (C1).
      return this.connections.setStatus(edge.id, ConnectionStatus.ACCEPTED);
    }
    if (edge !== null) {
      // A prior DECLINED edge — enforce a cooldown before a fresh request is allowed (C10).
      if (
        edge.respondedAt !== null &&
        Date.now() - edge.respondedAt.getTime() < DECLINE_COOLDOWN_MS
      ) {
        throw new AppException(
          ERROR_CODE.RATE_LIMITED,
          429,
          "Rad etilgan so'rovni birozdan so'ng qayta yuborishingiz mumkin",
        );
      }
      // Cooldown passed — clear it so the unique pair constraint allows a new request.
      await this.connections.deleteEdge(user.id, addresseeId);
    }
    return this.connections.create(user.id, addresseeId);
  }

  /** Accepts a pending request addressed to the caller. */
  async accept(user: AuthenticatedUser, requestId: string): Promise<Connection> {
    await this.loadIncomingPending(user, requestId);
    return this.connections.setStatus(requestId, ConnectionStatus.ACCEPTED);
  }

  /** Declines a pending request addressed to the caller. */
  async decline(user: AuthenticatedUser, requestId: string): Promise<void> {
    await this.loadIncomingPending(user, requestId);
    await this.connections.setStatus(requestId, ConnectionStatus.DECLINED);
  }

  /** Removes an accepted connection (either side may disconnect). */
  async remove(user: AuthenticatedUser, otherStudentId: string): Promise<void> {
    const edge = await this.connections.findEdge(user.id, otherStudentId);
    if (edge === null || edge.status !== ConnectionStatus.ACCEPTED) {
      throw AppException.notFound(ERROR_CODE.CONNECTION_NOT_FOUND, 'Bog‘lanish topilmadi');
    }
    await this.connections.deleteEdge(user.id, otherStudentId);
  }

  /** Blocks a student (removes any edge between them). Idempotent. */
  async block(user: AuthenticatedUser, studentId: string): Promise<void> {
    if (studentId === user.id) {
      throw new AppException(ERROR_CODE.CANNOT_CONNECT_SELF, 422, "O'zingizni bloklay olmaysiz");
    }
    if (!(await this.directory.exists(studentId))) {
      throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
    }
    await this.connections.block(user.id, studentId);
  }

  /** Unblocks a student. Idempotent. */
  async unblock(user: AuthenticatedUser, studentId: string): Promise<void> {
    await this.connections.unblock(user.id, studentId);
  }

  /**
   * The filtered student directory (`GET /v1/students`), excluding self + blocked, each row
   * annotated with the caller's `connectionStatus` and presence.
   */
  async listStudents(
    user: AuthenticatedUser,
    query: StudentListQuery,
    page: number,
    size: number,
  ): Promise<Page<SearchResult>> {
    const blocked = await this.connections.blockedIds(user.id);
    const excludeIds = [user.id, ...blocked];
    const restrictToIds = await this.resolveRelationshipNarrowing(user.id, query.connectionStatus);
    // NONE has no id list of its own — it is "everyone except every relationship I already have".
    if (query.connectionStatus === ConnectionView.NONE) {
      excludeIds.push(...(restrictToIds ?? []));
    }
    const { items, total } = await this.directory.list(
      query,
      excludeIds,
      query.connectionStatus === ConnectionView.NONE ? null : restrictToIds,
      page,
      size,
    );

    // One query for the whole page's edges, then the view per row — never a per-row findEdge.
    const edges = await this.connections.findEdges(
      user.id,
      items.map((student) => student.id),
    );
    const edgeByOtherId = new Map(
      edges.map((edge) => [
        edge.requesterId === user.id ? edge.addresseeId : edge.requesterId,
        edge,
      ]),
    );
    const viewById = new Map(
      items.map((student) => [
        student.id,
        this.viewFor(edgeByOtherId.get(student.id) ?? null, user.id),
      ]),
    );
    const students = await this.withPresence(
      items,
      (student) => viewById.get(student.id) === ConnectionView.CONNECTED,
    );
    const results = students.map((student): SearchResult => ({
      student,
      view: viewById.get(student.id) ?? ConnectionView.NONE,
    }));
    return { items: results, total };
  }

  /**
   * One student's profile (`GET /v1/students/{id}`), with presence and phone masked for this
   * caller and the relationship annotated.
   *
   * Exists because the only other way to see a person was to find them in a list or already have a
   * conversation with them — so a profile opened from anywhere else could not be shown at all.
   *
   * A block is a 403 rather than a 404: the caller can see this student exists (they were connected,
   * or found them before), so pretending otherwise would just look broken. Self is allowed — opening
   * your own profile through the same screen is the obvious thing for the client to do.
   */
  async getStudent(user: AuthenticatedUser, studentId: string): Promise<SearchResult> {
    const student = await this.directory.findSummary(studentId);
    if (student === null) {
      throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
    }
    if (studentId !== user.id && (await this.connections.isBlockedEitherWay(user.id, studentId))) {
      throw new AppException(ERROR_CODE.USER_BLOCKED, 403, 'Bu profilni ko‘rib bo‘lmaydi');
    }

    const edge = studentId === user.id ? null : await this.connections.findEdge(user.id, studentId);
    const view = studentId === user.id ? ConnectionView.NONE : this.viewFor(edge, user.id);
    const [withPresence] = await this.withPresence(
      [student],
      // Your own profile counts as connected to yourself: otherwise you would open it and find your
      // own phone number blanked out by your own privacy setting.
      () => studentId === user.id || view === ConnectionView.CONNECTED,
    );
    return { student: withPresence, view };
  }

  /**
   * Discovery search by username/full-name (`GET /v1/students/search`, deprecated). A thin alias
   * over `listStudents` so the two endpoints can never drift apart.
   */
  search(
    user: AuthenticatedUser,
    query: string | null,
    page: number,
    size: number,
  ): Promise<Page<SearchResult>> {
    return this.listStudents(
      user,
      {
        q: query,
        universityIds: [],
        genders: [],
        courseYears: [],
        birthYearFrom: null,
        birthYearTo: null,
        sort: StudentSort.NAME,
        connectionStatus: null,
      },
      page,
      size,
    );
  }

  /** The caller's accepted connections (the other student + when connected). */
  async listConnections(
    user: AuthenticatedUser,
    page: number,
    size: number,
  ): Promise<Page<ConnectionListItem>> {
    const { items: edges, total } = await this.connections.listAccepted(user.id, page, size);
    const summaries = await this.directory.findSummaries(
      edges.map((edge) => this.otherId(edge, user.id)),
    );
    // Everyone in this list is by definition an accepted connection.
    const withPresence = await this.withPresence(summaries, () => true);
    const byId = new Map(withPresence.map((summary) => [summary.id, summary]));
    const items = edges.flatMap((edge): ConnectionListItem[] => {
      const student = byId.get(this.otherId(edge, user.id));
      return student === undefined
        ? []
        : [{ student, connectedAt: edge.respondedAt ?? edge.createdAt }];
    });
    return { items, total };
  }

  /**
   * The students the caller has blocked, newest first (§18). Presence is never resolved here: a
   * block removes the connection, so `CONNECTIONS` visibility already hides `online`/`lastSeenAt` —
   * asking Redis for it would only risk leaking presence to someone they cut off.
   */
  async listBlocked(
    user: AuthenticatedUser,
    page: number,
    size: number,
  ): Promise<Page<BlockedListItem>> {
    const { items: blocks, total } = await this.connections.listBlocked(user.id, page, size);
    const summaries = await this.directory.findSummaries(blocks.map((block) => block.studentId));
    const byId = new Map(summaries.map((summary) => [summary.id, summary]));
    const items = blocks.flatMap((block): BlockedListItem[] => {
      const student = byId.get(block.studentId);
      return student === undefined
        ? []
        : [{ student: applyPresenceVisibility(student, false, false), blockedAt: block.blockedAt }];
    });
    return { items, total };
  }

  /** The caller's pending requests, incoming or outgoing. */
  async listRequests(
    user: AuthenticatedUser,
    direction: 'incoming' | 'outgoing',
    page: number,
    size: number,
  ): Promise<Page<RequestListItem>> {
    const { items: edges, total } = await this.connections.listPending(
      user.id,
      direction,
      page,
      size,
    );
    const otherOf = (edge: Connection): string =>
      direction === 'incoming' ? edge.requesterId : edge.addresseeId;
    const summaries = await this.directory.findSummaries(edges.map(otherOf));
    // A pending request is not yet a connection — only EVERYONE exposes presence here.
    const withPresence = await this.withPresence(summaries, () => false);
    const byId = new Map(withPresence.map((summary) => [summary.id, summary]));
    const items = edges.flatMap((edge): RequestListItem[] => {
      const student = byId.get(otherOf(edge));
      return student === undefined
        ? []
        : [{ connectionId: edge.id, student, createdAt: edge.createdAt }];
    });
    return { items, total };
  }

  /**
   * Fills `online` from live presence and masks both presence fields per each student's
   * `lastSeenVisibility` (C7). `isConnected` says whether the viewer is an accepted connection of
   * that student — the deciding input for `CONNECTIONS` visibility.
   */
  private async withPresence(
    students: StudentSummary[],
    isConnected: (student: StudentSummary) => boolean,
  ): Promise<StudentSummary[]> {
    const online = await this.presence.onlineAmong(students.map((student) => student.id));
    return students.map((student) =>
      applyPresenceVisibility(student, isConnected(student), online.has(student.id)),
    );
  }

  /**
   * The id set a `connectionStatus` filter narrows to, or `null` when unfiltered. For `NONE` it
   * returns every id the caller already has any relationship with — the caller excludes those.
   */
  private async resolveRelationshipNarrowing(
    selfId: string,
    view: ConnectionView | null,
  ): Promise<string[] | null> {
    if (view === null) {
      return null;
    }
    if (view === ConnectionView.NONE) {
      const [connected, out, incoming] = await Promise.all([
        this.connections.idsByView(selfId, ConnectionView.CONNECTED),
        this.connections.idsByView(selfId, ConnectionView.PENDING_OUT),
        this.connections.idsByView(selfId, ConnectionView.PENDING_IN),
      ]);
      return [...new Set([...connected, ...out, ...incoming])];
    }
    return this.connections.idsByView(selfId, view);
  }

  /** Loads a request that must be PENDING and addressed to the caller, else 404. */
  private async loadIncomingPending(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<Connection> {
    const edge = await this.connections.findById(requestId);
    if (edge === null || edge.addresseeId !== user.id || edge.status !== ConnectionStatus.PENDING) {
      throw AppException.notFound(ERROR_CODE.CONNECTION_REQUEST_NOT_FOUND, "So'rov topilmadi");
    }
    return edge;
  }

  private otherId(edge: Connection, selfId: string): string {
    return edge.requesterId === selfId ? edge.addresseeId : edge.requesterId;
  }

  private viewFor(edge: Connection | null, selfId: string): ConnectionView {
    if (edge === null || edge.status === ConnectionStatus.DECLINED) {
      return ConnectionView.NONE;
    }
    if (edge.status === ConnectionStatus.ACCEPTED) {
      return ConnectionView.CONNECTED;
    }
    return edge.requesterId === selfId ? ConnectionView.PENDING_OUT : ConnectionView.PENDING_IN;
  }
}
