import { tashkentClock } from './feed-time';

describe('tashkentClock', () => {
  it('shifts UTC into Tashkent time (UTC+5)', () => {
    // 2026-07-27 is a Monday. 06:30 UTC = 11:30 in Tashkent.
    expect(tashkentClock(new Date('2026-07-27T06:30:00Z'))).toEqual({
      day: 'MON',
      previousDay: 'SUN',
      minuteOfDay: 11 * 60 + 30,
    });
  });

  it('rolls the weekday forward when the shift crosses midnight', () => {
    // 21:00 UTC Monday is already 02:00 Tuesday in Tashkent.
    expect(tashkentClock(new Date('2026-07-27T21:00:00Z'))).toEqual({
      day: 'TUE',
      previousDay: 'MON',
      minuteOfDay: 2 * 60,
    });
  });

  it('wraps previousDay around the start of the week', () => {
    // 2026-07-26 is a Sunday; 05:00 UTC = 10:00 Sunday in Tashkent.
    expect(tashkentClock(new Date('2026-07-26T05:00:00Z'))).toMatchObject({
      day: 'SUN',
      previousDay: 'SAT',
    });
  });

  it('reports midnight as minute zero', () => {
    // 19:00 UTC = 00:00 next day in Tashkent.
    expect(tashkentClock(new Date('2026-07-27T19:00:00Z'))).toMatchObject({
      day: 'TUE',
      minuteOfDay: 0,
    });
  });
});
