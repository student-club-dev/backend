/**
 * Quiet hours (push catalogue §5.3): no push between 22:00 and 08:00 Tashkent time.
 *
 * Only the push is held — the list row is always written immediately, so nothing is lost, it is
 * merely not allowed to light up a phone at 03:00.
 *
 * Chat, calls and connection requests are exempt (`NotificationEvent.urgent`): they are live
 * conversation between people, and a message delivered nine hours late has stopped being a message.
 */

/** Uzbekistan is UTC+5 year-round — no daylight saving, so a fixed offset is exact, not an
 * approximation. That is why this needs no timezone database. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 8;

/** The wall-clock hour in Tashkent, 0–23. */
function tashkentHour(at: Date): number {
  return new Date(at.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
}

/** Whether a push sent at `at` would arrive during the quiet window. */
export function isQuietHour(at: Date): boolean {
  const hour = tashkentHour(at);
  // The window wraps midnight, so this is an OR rather than a range check — writing it as
  // `hour >= 22 && hour < 8` is the bug this comment exists to prevent.
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/**
 * The next moment a held push may go out: the coming 08:00 in Tashkent.
 *
 * Called only when `isQuietHour(at)` is true, so the answer is always within the next ten hours —
 * either later this morning (sent between midnight and 08:00) or tomorrow morning (sent after
 * 22:00).
 */
/**
 * The Tashkent calendar day as `YYYY-MM-DD`.
 *
 * Used to key "once today" (§5.1). It has to be the *local* day: keyed on UTC, the boundary would
 * fall at 05:00 Tashkent, so a digest sent at 09:00 and another at 04:00 the next morning would
 * count as the same day while two sent five hours apart would not.
 */
export function tashkentDayOf(at: Date): string {
  return new Date(at.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextQuietWindowEnd(at: Date): Date {
  const local = at.getTime() + TASHKENT_OFFSET_MS;
  const startOfLocalDay = Math.floor(local / MS_PER_DAY) * MS_PER_DAY;
  const eightThisDay = startOfLocalDay + QUIET_UNTIL_HOUR * MS_PER_HOUR;
  const target = local < eightThisDay ? eightThisDay : eightThisDay + MS_PER_DAY;
  return new Date(target - TASHKENT_OFFSET_MS);
}
