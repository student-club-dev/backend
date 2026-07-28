/** Injection token for the presence port (Redis-backed; C7). */
export const PRESENCE_REPOSITORY = Symbol('PRESENCE_REPOSITORY');

/**
 * Ephemeral online-presence, refcounted by open sockets. Shared infrastructure: the chat gateway
 * writes it (socket connect/disconnect) and both `chat` and `connections` read it to fill
 * `StudentSummary.online`. `lastSeenAt` persistence on true-offline is the caller's job.
 */
export interface PresenceRepository {
  /** A socket connected: increment the refcount and refresh the TTL. */
  online(studentId: string): Promise<void>;

  /** A socket disconnected: decrement; returns `true` when the student is now truly offline. */
  offline(studentId: string): Promise<boolean>;

  isOnline(studentId: string): Promise<boolean>;

  /** The subset of `studentIds` that currently have an open socket. */
  onlineAmong(studentIds: string[]): Promise<Set<string>>;
}
