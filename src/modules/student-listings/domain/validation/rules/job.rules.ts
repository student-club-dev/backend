import { isKnownJobCategoryKey } from '../../catalogs/job.catalog';
import type { JobDetails } from '../../entities/student-listing.entity';
import { EmploymentType, PayPeriod, WorkShift } from '../../enums/detail.enums';
import { StudentPriceUnit } from '../../enums/student-price-unit.enum';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

const VACANCIES_MIN = 1;
const VACANCIES_MAX = 100;
const HOURS_MIN = 1;
const HOURS_MAX = 24;

/** §4.4 — a rotating pattern only means something across weeks, so not on a single-day job. */
const DAILY_SHIFTS: readonly WorkShift[] = [
  WorkShift.MORNING,
  WorkShift.DAY,
  WorkShift.EVENING,
  WorkShift.NIGHT,
  WorkShift.FLEXIBLE,
];

/** §4.4 — which pay periods each employment type accepts. */
const ALLOWED_PAY_PERIODS: Readonly<Record<EmploymentType, readonly PayPeriod[]>> = {
  [EmploymentType.DAILY]: [PayPeriod.DAILY, PayPeriod.HOURLY, PayPeriod.PER_TASK],
  [EmploymentType.PERMANENT]: [
    PayPeriod.MONTHLY,
    PayPeriod.DAILY,
    PayPeriod.HOURLY,
    PayPeriod.WEEKLY,
  ],
};

/**
 * §4.4 — the price unit each pay period implies. Weekly pay is still quoted per day, since the
 * contract has no PER_WEEK unit and a daily rate is what a student compares offers on.
 */
const PAY_PERIOD_PRICE_UNIT: Readonly<Record<PayPeriod, StudentPriceUnit>> = {
  [PayPeriod.HOURLY]: StudentPriceUnit.PER_HOUR,
  [PayPeriod.DAILY]: StudentPriceUnit.PER_DAY,
  [PayPeriod.WEEKLY]: StudentPriceUnit.PER_DAY,
  [PayPeriod.MONTHLY]: StudentPriceUnit.PER_MONTH,
  [PayPeriod.PER_TASK]: StudentPriceUnit.PER_ITEM,
};

/** §4.4 — these patterns have no fixed weekdays, so a weekday list is not demanded. */
const SHIFTS_WITHOUT_WEEKDAYS: readonly WorkShift[] = [
  WorkShift.SHIFT_2_2,
  WorkShift.SHIFT_1_2,
  WorkShift.FLEXIBLE,
];

/** §5.6, plus the §4.4 constraints tying employment type to shift, pay period and price unit. */
export function jobRules(details: JobDetails, priceUnit: StudentPriceUnit | null): FieldErrors {
  const errors: FieldErrors = {};

  const categoryError = categoryErrorOf(details);
  if (categoryError !== null) {
    errors[ListingField.JOB_CATEGORY] = categoryError;
  }

  if (details.companyName === null || details.companyName.trim().length === 0) {
    errors[ListingField.BUSINESS_NAME] = MSG.COMPANY_NAME_REQUIRED;
  }

  const shiftError = shiftErrorOf(details);
  if (shiftError !== null) {
    errors[ListingField.JOB_SHIFT] = shiftError;
  }

  const scheduleError = scheduleErrorOf(details);
  if (scheduleError !== null) {
    errors[ListingField.JOB_SCHEDULE] = scheduleError;
  }

  const payError = payErrorOf(details, priceUnit);
  if (payError !== null) {
    errors[ListingField.JOB_PAY] = payError;
  }

  if (details.ageFrom !== null && details.ageTo !== null && details.ageFrom > details.ageTo) {
    errors[ListingField.ATTRIBUTES] = MSG.AGE_RANGE_INVALID;
  }

  return errors;
}

function categoryErrorOf(details: JobDetails): string | null {
  const { categoryKey } = details;
  if (categoryKey === null || categoryKey.trim().length === 0) {
    return MSG.JOB_CATEGORY_REQUIRED;
  }
  if (!isKnownJobCategoryKey(categoryKey)) {
    return MSG.CATALOG_KEY_UNKNOWN;
  }
  return null;
}

function shiftErrorOf(details: JobDetails): string | null {
  const { shift, employment } = details;
  if (shift === null) {
    return MSG.JOB_SHIFT_REQUIRED;
  }
  if (employment === EmploymentType.DAILY && !DAILY_SHIFTS.includes(shift)) {
    return MSG.JOB_SHIFT_PERMANENT_ONLY;
  }
  return null;
}

function scheduleErrorOf(details: JobDetails): string | null {
  const { shift, employment, schedule, workDate } = details;

  // FLEXIBLE means "whenever suits" — there is no range to give.
  if (shift !== WorkShift.FLEXIBLE && (schedule.startTime === null || schedule.endTime === null)) {
    return MSG.JOB_TIME_RANGE_REQUIRED;
  }
  if (employment === EmploymentType.DAILY && workDate === null) {
    return MSG.JOB_WORK_DATE_REQUIRED;
  }
  if (
    employment === EmploymentType.PERMANENT &&
    schedule.days.length === 0 &&
    (shift === null || !SHIFTS_WITHOUT_WEEKDAYS.includes(shift))
  ) {
    return MSG.JOB_DAYS_REQUIRED;
  }
  if (
    schedule.hoursPerDay !== null &&
    (schedule.hoursPerDay < HOURS_MIN || schedule.hoursPerDay > HOURS_MAX)
  ) {
    return MSG.JOB_HOURS_OUT_OF_RANGE;
  }
  return null;
}

function payErrorOf(details: JobDetails, priceUnit: StudentPriceUnit | null): string | null {
  const { vacancies, payPeriod, employment } = details;

  if (vacancies === null || vacancies < VACANCIES_MIN || vacancies > VACANCIES_MAX) {
    return MSG.JOB_VACANCIES_REQUIRED;
  }
  if (
    payPeriod !== null &&
    employment !== null &&
    !ALLOWED_PAY_PERIODS[employment].includes(payPeriod)
  ) {
    return MSG.JOB_PAY_PERIOD_MISMATCH;
  }
  // A monthly salary shown as an hourly rate would misrepresent the offer by two orders of
  // magnitude, so the two are required to agree.
  if (payPeriod !== null && priceUnit !== null && PAY_PERIOD_PRICE_UNIT[payPeriod] !== priceUnit) {
    return MSG.JOB_PRICE_UNIT_MISMATCH;
  }
  return null;
}
