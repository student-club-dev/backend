import { DayOfWeek as PrismaDayOfWeek, Prisma } from '@prisma/client';
import { WorkingHours } from '../domain/entities/branch.entity';

/** `HH:mm` — a two-digit hour (00-23) and minute (00-59). */
const CLOCK_TIME = /^(\d{2}):(\d{2})$/;
const MINUTES_PER_HOUR = 60;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;

/**
 * Converts an `HH:mm` clock time to minutes past midnight (`"09:00"` → 540) — the form the
 * `branch_working_hours` side table stores so `openNow` is an indexed integer comparison.
 * A missing time stays `null`; so does anything that is not a valid clock time (the wire DTO
 * accepts any string), which reads as "no known open/close" rather than a wrong hour.
 */
export function toMinutesPastMidnight(time: string | null): number | null {
  if (time === null) {
    return null;
  }
  const match = CLOCK_TIME.exec(time);
  if (match === null) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > MAX_HOUR || minute > MAX_MINUTE) {
    return null;
  }
  return hour * MINUTES_PER_HOUR + minute;
}

/**
 * Flattens a branch's `workingHours` into `branch_working_hours` rows (STUDENT_FEED.md D11). The
 * JSONB column stays the wire contract — these rows exist only so the feed can filter `openNow` in
 * SQL. `spansMidnight` marks a venue whose closing time falls on the next day (20:00-04:00), i.e.
 * `close <= open`; it needs both times, so a day missing either never spans midnight.
 */
export function toWorkingHourRows(
  branchId: string,
  hours: WorkingHours[],
): Prisma.BranchWorkingHourCreateManyInput[] {
  return hours.map((entry) => {
    const openMinute = toMinutesPastMidnight(entry.open);
    const closeMinute = toMinutesPastMidnight(entry.close);
    return {
      branchId,
      day: PrismaDayOfWeek[entry.day],
      openMinute,
      closeMinute,
      spansMidnight: openMinute !== null && closeMinute !== null && closeMinute <= openMinute,
      isClosed: entry.isClosed,
    };
  });
}
