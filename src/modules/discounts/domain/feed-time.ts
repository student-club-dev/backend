/** Uzbekistan has a single, DST-free timezone: UTC+5 year-round. */
const TASHKENT_OFFSET_MINUTES = 5 * 60;

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export type WeekDay = (typeof DAYS)[number];

/**
 * "Now" as the opening-hours tables see it: which weekday it is in Tashkent, how many minutes past
 * midnight, and the day before.
 *
 * `previousDay` is not decoration — a venue open 20:00–04:00 is still open at 02:00, and those
 * hours are stored on the PREVIOUS day's row. Without it every overnight venue reads as closed for
 * four hours a night.
 */
export interface FeedClock {
  day: WeekDay;
  previousDay: WeekDay;
  minuteOfDay: number;
}

export function tashkentClock(now: Date): FeedClock {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MINUTES * 60_000);
  const index = shifted.getUTCDay();
  return {
    day: DAYS[index],
    previousDay: DAYS[(index + 6) % 7],
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
