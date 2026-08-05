/**
 * The call lifecycle's deadlines, in one place.
 *
 * They live in the domain rather than beside the service that enforces them because several things
 * need them and one of those is the push layer — and `call-push.service.ts` importing
 * `calls.service.ts` while `calls.service.ts` imports it back is a circular import. TypeScript
 * accepts that; Nest does not survive it, because one of the two modules is still `undefined` when
 * the decorator metadata is emitted, and the constructor parameter silently becomes unresolvable.
 */

/** How long a call rings before it gives up (design §5.2). */
export const RING_TIMEOUT_MS = 45_000;

/** How long after `accept` the two have to actually connect. */
export const CONNECT_TIMEOUT_MS = 30_000;

/** The hard ceiling on a single call — a forgotten open call must not run forever. */
export const MAX_DURATION_MS = 4 * 3600 * 1000;

/** How long a dropped socket is tolerated before the call is closed. */
export const DISCONNECT_GRACE_MS = 20_000;
