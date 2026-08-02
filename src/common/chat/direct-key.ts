/**
 * Stable key for a 1:1 conversation, independent of who started it. Sorting first is what makes
 * (A,B) and (B,A) the same conversation — the `directKey` unique index relies on it.
 *
 * Lives in `common/` because the calls module needs the same key to resolve a pair to its
 * conversation without importing chat (that direction is taken: chat subscribes to CallEndedBus).
 */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}
