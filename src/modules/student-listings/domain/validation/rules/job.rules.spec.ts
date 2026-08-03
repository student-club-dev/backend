import type { JobDetails } from '../../entities/student-listing.entity';
import {
  EmploymentType,
  ExperienceLevel,
  PayPeriod,
  WeekDay,
  WorkShift,
} from '../../enums/detail.enums';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../../enums/student-price-unit.enum';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { jobRules } from './job.rules';

/** A valid DAILY courier job. */
function details(overrides: Partial<JobDetails> = {}): JobDetails {
  return {
    kind: StudentListingKind.JOB,
    employment: EmploymentType.DAILY,
    categoryKey: 'COURIER',
    companyName: 'Express Delivery',
    shift: WorkShift.MORNING,
    schedule: { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
    payPeriod: PayPeriod.DAILY,
    vacancies: 3,
    gender: null,
    experience: ExperienceLevel.NONE,
    ageFrom: 18,
    ageTo: 30,
    requirements: [],
    benefits: [],
    workDate: new Date('2026-08-05T00:00:00Z'),
    payoutNote: null,
    ...overrides,
  };
}

/** A valid PERMANENT job — no workDate, weekdays required, monthly pay. */
function permanent(overrides: Partial<JobDetails> = {}): JobDetails {
  return details({
    employment: EmploymentType.PERMANENT,
    payPeriod: PayPeriod.MONTHLY,
    workDate: null,
    schedule: { days: [WeekDay.MONDAY], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
    ...overrides,
  });
}

describe('jobRules (§5.6)', () => {
  it('passes a well-formed DAILY job', () => {
    expect(jobRules(details(), StudentPriceUnit.PER_DAY)).toEqual({});
  });

  it('passes a well-formed PERMANENT job', () => {
    expect(jobRules(permanent(), StudentPriceUnit.PER_MONTH)).toEqual({});
  });

  describe('category', () => {
    it.each([null, '', '  '])('requires a category key (%p)', (categoryKey) => {
      expect(
        jobRules(details({ categoryKey }), StudentPriceUnit.PER_DAY)[ListingField.JOB_CATEGORY],
      ).toBe(MSG.JOB_CATEGORY_REQUIRED);
    });

    it('rejects an unknown category key', () => {
      expect(
        jobRules(details({ categoryKey: 'ASTRONAUT' }), StudentPriceUnit.PER_DAY)[
          ListingField.JOB_CATEGORY
        ],
      ).toBe(MSG.CATALOG_KEY_UNKNOWN);
    });
  });

  it.each([null, '   '])('requires a company name (%p)', (companyName) => {
    expect(
      jobRules(details({ companyName }), StudentPriceUnit.PER_DAY)[ListingField.BUSINESS_NAME],
    ).toBe(MSG.COMPANY_NAME_REQUIRED);
  });

  describe('shift', () => {
    it('requires one', () => {
      expect(
        jobRules(details({ shift: null }), StudentPriceUnit.PER_DAY)[ListingField.JOB_SHIFT],
      ).toBe(MSG.JOB_SHIFT_REQUIRED);
    });

    it.each([WorkShift.SHIFT_2_2, WorkShift.SHIFT_1_2])(
      'rejects the rotating shift %s on a DAILY job',
      (shift) => {
        // §4.4 — a 2/2 rotation is meaningless for a single day's work.
        expect(jobRules(details({ shift }), StudentPriceUnit.PER_DAY)[ListingField.JOB_SHIFT]).toBe(
          MSG.JOB_SHIFT_PERMANENT_ONLY,
        );
      },
    );

    it.each([WorkShift.SHIFT_2_2, WorkShift.SHIFT_1_2])(
      'accepts %s on a PERMANENT job',
      (shift) => {
        expect(
          jobRules(permanent({ shift }), StudentPriceUnit.PER_MONTH)[ListingField.JOB_SHIFT],
        ).toBeUndefined();
      },
    );
  });

  describe('schedule', () => {
    const noTimes = { days: [], startTime: null, endTime: null, hoursPerDay: 8 };

    it('requires a time range unless the shift is FLEXIBLE', () => {
      expect(
        jobRules(details({ schedule: noTimes }), StudentPriceUnit.PER_DAY)[
          ListingField.JOB_SCHEDULE
        ],
      ).toBe(MSG.JOB_TIME_RANGE_REQUIRED);
    });

    it('does not require a time range for a FLEXIBLE shift', () => {
      expect(
        jobRules(
          details({ shift: WorkShift.FLEXIBLE, schedule: noTimes }),
          StudentPriceUnit.PER_DAY,
        )[ListingField.JOB_SCHEDULE],
      ).toBeUndefined();
    });

    it('requires workDate for a DAILY job', () => {
      expect(
        jobRules(details({ workDate: null }), StudentPriceUnit.PER_DAY)[ListingField.JOB_SCHEDULE],
      ).toBe(MSG.JOB_WORK_DATE_REQUIRED);
    });

    it('requires weekdays for a PERMANENT job', () => {
      const withoutDays = permanent({
        schedule: { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
      });
      expect(jobRules(withoutDays, StudentPriceUnit.PER_MONTH)[ListingField.JOB_SCHEDULE]).toBe(
        MSG.JOB_DAYS_REQUIRED,
      );
    });

    it.each([WorkShift.SHIFT_2_2, WorkShift.SHIFT_1_2, WorkShift.FLEXIBLE])(
      'does not require weekdays for a PERMANENT %s shift',
      (shift) => {
        // These patterns have no fixed weekdays, so demanding them would be nonsense (§5.6).
        const withoutDays = permanent({
          shift,
          schedule: { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
        });
        expect(
          jobRules(withoutDays, StudentPriceUnit.PER_MONTH)[ListingField.JOB_SCHEDULE],
        ).toBeUndefined();
      },
    );

    it.each([0, 25])('rejects %i hours per day', (hoursPerDay) => {
      const schedule = { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay };
      expect(
        jobRules(details({ schedule }), StudentPriceUnit.PER_DAY)[ListingField.JOB_SCHEDULE],
      ).toBe(MSG.JOB_HOURS_OUT_OF_RANGE);
    });
  });

  describe('pay', () => {
    it.each([null, 0, 101])('rejects %p vacancies', (vacancies) => {
      expect(jobRules(details({ vacancies }), StudentPriceUnit.PER_DAY)[ListingField.JOB_PAY]).toBe(
        MSG.JOB_VACANCIES_REQUIRED,
      );
    });

    it('rejects a pay period the employment type does not allow', () => {
      // §4.4 — MONTHLY pay makes no sense for a one-day job.
      expect(
        jobRules(details({ payPeriod: PayPeriod.MONTHLY }), StudentPriceUnit.PER_MONTH)[
          ListingField.JOB_PAY
        ],
      ).toBe(MSG.JOB_PAY_PERIOD_MISMATCH);
    });

    it('rejects a price unit that contradicts the pay period', () => {
      expect(
        jobRules(details({ payPeriod: PayPeriod.HOURLY }), StudentPriceUnit.PER_MONTH)[
          ListingField.JOB_PAY
        ],
      ).toBe(MSG.JOB_PRICE_UNIT_MISMATCH);
    });

    it.each([
      [PayPeriod.HOURLY, StudentPriceUnit.PER_HOUR],
      [PayPeriod.DAILY, StudentPriceUnit.PER_DAY],
      [PayPeriod.PER_TASK, StudentPriceUnit.PER_ITEM],
    ])('accepts %s paired with %s', (payPeriod, priceUnit) => {
      expect(jobRules(details({ payPeriod }), priceUnit)[ListingField.JOB_PAY]).toBeUndefined();
    });

    it('accepts WEEKLY pay with PER_DAY on a PERMANENT job', () => {
      expect(
        jobRules(permanent({ payPeriod: PayPeriod.WEEKLY }), StudentPriceUnit.PER_DAY)[
          ListingField.JOB_PAY
        ],
      ).toBeUndefined();
    });
  });

  it('rejects an inverted age range', () => {
    expect(
      jobRules(details({ ageFrom: 30, ageTo: 18 }), StudentPriceUnit.PER_DAY)[
        ListingField.ATTRIBUTES
      ],
    ).toBe(MSG.AGE_RANGE_INVALID);
  });

  it('accepts a single-age range', () => {
    expect(
      jobRules(details({ ageFrom: 20, ageTo: 20 }), StudentPriceUnit.PER_DAY)[
        ListingField.ATTRIBUTES
      ],
    ).toBeUndefined();
  });
});
