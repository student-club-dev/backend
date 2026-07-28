import { Connection } from './entities/connection.entity';
import { ConnectionStatus } from './enums/connection-status.enum';
import { ConnectionView } from './enums/connection-view.enum';

/** Injection token for the connections + blocks repository port (bound to the Prisma impl). */
export const CONNECTIONS_REPOSITORY = Symbol('CONNECTIONS_REPOSITORY');

/** A page of edges plus the unpaginated total. */
export interface ConnectionPage {
  items: Connection[];
  total: number;
}

/**
 * Connection-edge and block data access. The application layer depends on this interface only; the
 * Prisma implementation lives in infrastructure. All reads/writes are on `students`-scoped rows.
 */
export interface ConnectionsRepository {
  /** The single edge between `a` and `b` in either direction, or `null`. */
  findEdge(a: string, b: string): Promise<Connection | null>;

  /**
   * Every edge between `selfId` and any of `otherIds`, in one query — annotating a page of students
   * with their `connectionStatus` without a per-row `findEdge`.
   */
  findEdges(selfId: string, otherIds: string[]): Promise<Connection[]>;

  /**
   * The ids `selfId` stands in `view` with: CONNECTED (accepted), PENDING_OUT (they were asked by
   * `selfId`) or PENDING_IN (they asked `selfId`). `NONE` has no finite id set — the caller
   * inverts the other three instead.
   */
  idsByView(
    selfId: string,
    view: ConnectionView.CONNECTED | ConnectionView.PENDING_OUT | ConnectionView.PENDING_IN,
  ): Promise<string[]>;

  /** By edge id, or `null`. */
  findById(id: string): Promise<Connection | null>;

  /** Creates a PENDING edge `requester → addressee`. */
  create(requesterId: string, addresseeId: string): Promise<Connection>;

  /** Sets the status (and `respondedAt = now` for ACCEPTED/DECLINED). Returns the updated edge. */
  setStatus(id: string, status: ConnectionStatus): Promise<Connection>;

  /** Deletes the edge between the pair (either direction), regardless of status. Idempotent. */
  deleteEdge(a: string, b: string): Promise<void>;

  /** ACCEPTED edges touching `studentId`, newest-accepted first, paginated. */
  listAccepted(studentId: string, page: number, size: number): Promise<ConnectionPage>;

  /** PENDING edges where `studentId` is the addressee (incoming) or requester (outgoing). */
  listPending(
    studentId: string,
    direction: 'incoming' | 'outgoing',
    page: number,
    size: number,
  ): Promise<ConnectionPage>;

  // --- blocks ---

  /** Whether either student has blocked the other. */
  isBlockedEitherWay(a: string, b: string): Promise<boolean>;

  /** Idempotently blocks `blockedId` for `blockerId` and removes any edge between the pair (C1). */
  block(blockerId: string, blockedId: string): Promise<void>;

  /** Removes the block (idempotent). */
  unblock(blockerId: string, blockedId: string): Promise<void>;

  /** The ids `viewerId` has blocked or been blocked by — excluded from discovery search. */
  blockedIds(viewerId: string): Promise<string[]>;
}
