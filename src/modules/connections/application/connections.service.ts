import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CONNECTIONS_REPOSITORY, ConnectionsRepository } from '../domain/connections.repository';
import { Connection } from '../domain/entities/connection.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';
import { ConnectionView } from '../domain/enums/connection-view.enum';
import {
  STUDENT_DIRECTORY,
  StudentDirectoryRepository,
} from '../domain/student-directory.repository';
import { ConnectionListItem, Page, RequestListItem, SearchResult } from './connections.io';

/**
 * Connection use-cases (LinkedIn-style, docs/architecture/chat.md C1/C11). Students-only; the caller
 * id is the JWT `sub`. Depends on repository interfaces only. Rate-limits/cooldowns (C10) are a
 * follow-up (plan Task 10).
 */
@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(CONNECTIONS_REPOSITORY) private readonly connections: ConnectionsRepository,
    @Inject(STUDENT_DIRECTORY) private readonly directory: StudentDirectoryRepository,
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
      // a prior DECLINED edge — clear it so the unique pair constraint allows a fresh request.
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

  /** Discovery search by username/full-name, excluding self + blocked, annotated with the view. */
  async search(
    user: AuthenticatedUser,
    query: string,
    page: number,
    size: number,
  ): Promise<Page<SearchResult>> {
    const blocked = await this.connections.blockedIds(user.id);
    const { items, total } = await this.directory.search(query, [user.id, ...blocked], page, size);
    const results = await Promise.all(
      items.map(async (student): Promise<SearchResult> => {
        const edge = await this.connections.findEdge(user.id, student.id);
        return { student, view: this.viewFor(edge, user.id) };
      }),
    );
    return { items: results, total };
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
    const byId = new Map(summaries.map((summary) => [summary.id, summary]));
    const items = edges.flatMap((edge): ConnectionListItem[] => {
      const student = byId.get(this.otherId(edge, user.id));
      return student === undefined
        ? []
        : [{ student, connectedAt: edge.respondedAt ?? edge.createdAt }];
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
    const byId = new Map(summaries.map((summary) => [summary.id, summary]));
    const items = edges.flatMap((edge): RequestListItem[] => {
      const student = byId.get(otherOf(edge));
      return student === undefined
        ? []
        : [{ connectionId: edge.id, student, createdAt: edge.createdAt }];
    });
    return { items, total };
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
