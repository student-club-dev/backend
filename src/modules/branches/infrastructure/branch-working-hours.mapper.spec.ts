import { DayOfWeek as PrismaDayOfWeek } from '@prisma/client';
import { WorkingHours } from '../domain/entities/branch.entity';
import { DayOfWeek } from '../domain/enums/day-of-week.enum';
import { toMinutesPastMidnight, toWorkingHourRows } from './branch-working-hours.mapper';

function hours(overrides: Partial<WorkingHours> = {}): WorkingHours {
  return { day: DayOfWeek.MON, open: '09:00', close: '18:00', isClosed: false, ...overrides };
}

describe('toMinutesPastMidnight', () => {
  it('converts an HH:mm clock time to minutes past midnight', () => {
    expect(toMinutesPastMidnight('09:00')).toBe(540);
    expect(toMinutesPastMidnight('00:00')).toBe(0);
    expect(toMinutesPastMidnight('23:59')).toBe(1439);
    expect(toMinutesPastMidnight('20:30')).toBe(1230);
  });

  it('keeps a missing time null', () => {
    expect(toMinutesPastMidnight(null)).toBeNull();
  });

  it('returns null for a value that is not a valid clock time', () => {
    expect(toMinutesPastMidnight('')).toBeNull();
    expect(toMinutesPastMidnight('kechqurun')).toBeNull();
    expect(toMinutesPastMidnight('25:00')).toBeNull();
    expect(toMinutesPastMidnight('10:60')).toBeNull();
  });
});

describe('toWorkingHourRows', () => {
  it('maps a day to its side-table row', () => {
    expect(toWorkingHourRows('br-1', [hours()])).toEqual([
      {
        branchId: 'br-1',
        day: PrismaDayOfWeek.MON,
        openMinute: 540,
        closeMinute: 1080,
        spansMidnight: false,
        isClosed: false,
      },
    ]);
  });

  it('flags a venue that stays open past midnight (20:00-04:00)', () => {
    const [row] = toWorkingHourRows('br-1', [hours({ open: '20:00', close: '04:00' })]);

    expect(row).toMatchObject({ openMinute: 1200, closeMinute: 240, spansMidnight: true });
  });

  it('flags a 24-hour venue whose close equals its open', () => {
    const [row] = toWorkingHourRows('br-1', [hours({ open: '10:00', close: '10:00' })]);

    expect(row?.spansMidnight).toBe(true);
  });

  it('leaves a missing open/close null and never spans midnight', () => {
    const [row] = toWorkingHourRows('br-1', [
      hours({ day: DayOfWeek.SUN, open: null, close: null, isClosed: true }),
    ]);

    expect(row).toEqual({
      branchId: 'br-1',
      day: PrismaDayOfWeek.SUN,
      openMinute: null,
      closeMinute: null,
      spansMidnight: false,
      isClosed: true,
    });
  });

  it('maps every submitted day', () => {
    const rows = toWorkingHourRows('br-1', [
      hours({ day: DayOfWeek.MON }),
      hours({ day: DayOfWeek.SAT, open: '10:00', close: '16:00' }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.day)).toEqual([PrismaDayOfWeek.MON, PrismaDayOfWeek.SAT]);
  });
});
