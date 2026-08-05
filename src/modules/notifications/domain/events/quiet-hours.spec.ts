import {
  isQuietHour,
  nextQuietWindowEnd,
  tashkentDayOf,
  QUIET_FROM_HOUR,
  QUIET_UNTIL_HOUR,
} from './quiet-hours';

/**
 * Quiet hours are 22:00–08:00 **Tashkent**, and every bug this file guards against is a timezone
 * one. Uzbekistan is UTC+5, so each case below states the UTC instant and the local hour it is.
 */
describe('quiet hours (§5.3)', () => {
  /** UTC instant for a given Tashkent wall-clock hour on 2026-08-05. */
  const atTashkent = (hour: number, minute = 0): Date =>
    new Date(Date.UTC(2026, 7, 5, hour - 5, minute));

  describe('isQuietHour', () => {
    it.each([
      ['22:00 — the window opens', 22],
      ['23:30 — late evening', 23],
      ['00:00 — midnight', 0],
      ['03:00 — the middle of it', 3],
      ['07:59 — the last quiet minute', 7],
    ])('is quiet at %s', (_label, hour) => {
      expect(isQuietHour(atTashkent(hour))).toBe(true);
    });

    it.each([
      ['08:00 — the window closes', 8],
      ['12:00 — midday', 12],
      ['21:59 — the last loud minute', 21],
    ])('is not quiet at %s', (_label, hour) => {
      expect(isQuietHour(atTashkent(hour))).toBe(false);
    });

    it('matches the declared boundaries rather than hard-coded numbers', () => {
      expect(isQuietHour(atTashkent(QUIET_FROM_HOUR))).toBe(true);
      expect(isQuietHour(atTashkent(QUIET_UNTIL_HOUR))).toBe(false);
    });

    /**
     * The window wraps midnight, so the naive `hour >= 22 && hour < 8` is always false and would
     * silently disable quiet hours entirely.
     */
    it('is quiet on both sides of midnight', () => {
      expect(isQuietHour(atTashkent(23, 59))).toBe(true);
      expect(isQuietHour(atTashkent(0, 1))).toBe(true);
    });
  });

  describe('nextQuietWindowEnd', () => {
    it('is this morning’s 08:00 for a push held after midnight', () => {
      expect(nextQuietWindowEnd(atTashkent(3))).toEqual(atTashkent(8));
    });

    it('is tomorrow’s 08:00 for a push held in the evening', () => {
      const held = atTashkent(23);
      const due = nextQuietWindowEnd(held);

      expect(due.getTime() - held.getTime()).toBe(9 * 60 * 60 * 1000);
      expect(isQuietHour(due)).toBe(false);
    });

    it('always lands outside the quiet window, whenever it is called', () => {
      for (let hour = 0; hour < 24; hour += 1) {
        const at = atTashkent(hour);
        if (isQuietHour(at)) {
          expect(isQuietHour(nextQuietWindowEnd(at))).toBe(false);
        }
      }
    });

    it('never sends a held push backwards in time', () => {
      for (let hour = 0; hour < 24; hour += 1) {
        const at = atTashkent(hour);
        if (isQuietHour(at)) {
          expect(nextQuietWindowEnd(at).getTime()).toBeGreaterThan(at.getTime());
        }
      }
    });
  });

  describe('tashkentDayOf', () => {
    it('uses the local calendar day, not the UTC one', () => {
      // 02:00 Tashkent on the 5th is still 21:00 UTC on the 4th. Keyed on UTC, a digest sent at
      // 09:00 and one sent at 04:00 the next morning would collide.
      expect(tashkentDayOf(atTashkent(2))).toBe('2026-08-05');
      expect(tashkentDayOf(atTashkent(23))).toBe('2026-08-05');
    });

    it('rolls over at local midnight', () => {
      expect(tashkentDayOf(atTashkent(23, 59))).toBe('2026-08-05');
      expect(tashkentDayOf(new Date(atTashkent(23, 59).getTime() + 60_000))).toBe('2026-08-06');
    });
  });
});
