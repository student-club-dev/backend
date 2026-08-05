/**
 * The length caps every notification text passes through (push catalogue §1.4).
 *
 * These are not cosmetic. FCM rejects a message over 4 KB with `INVALID_ARGUMENT`, and
 * `FcmPushProvider` reads that code as "this token is dead" — so an oversized payload does not just
 * fail to arrive, it *deletes the recipient's device registration* and silently stops every future
 * notification from everyone. A single user-controlled string with no bound is enough to do that to
 * anybody they can reach.
 *
 * The database agrees but is less forgiving: `notifications.title` is `VARCHAR(120)` and `body` is
 * `VARCHAR(300)`, and Postgres **errors** on overflow rather than truncating. Cutting here is what
 * keeps a long listing title from turning a push into a 500.
 */
export const MAX_PUSH_NAME = 64;
export const MAX_PUSH_BODY = 120;
export const MAX_PUSH_TITLE = 120;

/** Trims, cuts to `max`, and treats a blank result as absent. Whitespace is not a name. */
function clip(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

/**
 * A person's display name, bounded. `firstName`/`lastName` have no length limit of their own, so
 * this is the cap that stands between a self-chosen name and the 4 KB ceiling.
 */
export function clipName(value: string | null | undefined): string | null {
  return clip(value, MAX_PUSH_NAME);
}

/** A notification title, bounded to what the column accepts. */
export function clipTitle(value: string): string {
  return clip(value, MAX_PUSH_TITLE) ?? 'StudentClub';
}

/** A notification body, bounded. Null stays null — a title-only card is a valid row (§2.5). */
export function clipBody(value: string | null | undefined): string | null {
  return clip(value, MAX_PUSH_BODY);
}
