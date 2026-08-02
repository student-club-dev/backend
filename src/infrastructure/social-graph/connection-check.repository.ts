/** Injection token for the connection-check port (reads the connections/blocks tables). */
export const CONNECTION_CHECK = Symbol('CONNECTION_CHECK');

/** Why a pair may not talk — `areConnected` folds these into one boolean, calls need them apart. */
export type ConnectionState = 'CONNECTED' | 'NOT_CONNECTED' | 'BLOCKED';

/**
 * Minimal read of the social graph — decoupled from the connections module's internals (both just
 * read the same tables). Shared by `chat` (gates a conversation) and `calls` (gates an invite).
 */
export interface ConnectionCheckRepository {
  /** True iff an ACCEPTED connection exists between the pair and neither has blocked the other. */
  areConnected(a: string, b: string): Promise<boolean>;

  /**
   * Every student `studentId` is connected to (accepted, not blocked) — the audience for a
   * `presence:update` (C7) and the input for masking presence in the conversation list.
   */
  connectedIds(studentId: string): Promise<string[]>;

  /**
   * Like `areConnected`, but distinguishes "no connection" from "blocked". A call must tell the
   * caller which one it is: `NOT_CONNECTED` is fixable by sending a request, `BLOCKED` is not.
   */
  connectionState(a: string, b: string): Promise<ConnectionState>;
}
