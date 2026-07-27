/** Injection token for the presence port (Redis-backed; C7). */
export const PRESENCE_REPOSITORY = Symbol('PRESENCE_REPOSITORY');

/**
 * Ephemeral online-presence, refcounted by open sockets. `lastSeenAt` persistence on true-offline
 * is handled by the implementation. Never stored in Postgres beyond `lastSeenAt`.
 */
export interface PresenceRepository {
  /** A socket connected: increment the refcount and refresh the TTL. */
  online(studentId: string): Promise<void>;

  /** A socket disconnected: decrement; returns `true` when the student is now truly offline. */
  offline(studentId: string): Promise<boolean>;

  isOnline(studentId: string): Promise<boolean>;
}
