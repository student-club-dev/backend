/** Injection token for the connection-check port (reads the connections/blocks tables). */
export const CONNECTION_CHECK = Symbol('CONNECTION_CHECK');

/**
 * Minimal read the chat module needs from the social graph — decoupled from the connections
 * module's internals (both just read the same tables).
 */
export interface ConnectionCheckRepository {
  /** True iff an ACCEPTED connection exists between the pair and neither has blocked the other. */
  areConnected(a: string, b: string): Promise<boolean>;
}
