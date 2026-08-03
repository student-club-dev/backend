import { TaskCategory, TaskFormat } from '../enums/detail.enums';
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { validRental } from './listing.fixture';
import { ListingField } from './listing-field';
import { MSG } from './messages';
import { validateForPublish } from './validate-for-publish';

const NOW = new Date('2026-08-03T00:00:00Z');

describe('validateForPublish', () => {
  it('returns {} for a publishable listing', () => {
    expect(validateForPublish(validRental(), NOW)).toEqual({});
  });

  it('collects errors from every rule group at once', () => {
    const broken = validRental({
      title: '',
      images: [],
      branches: [],
      details: {
        kind: StudentListingKind.RENTAL,
        propertyType: null,
        roomCount: null,
        currentTenants: null,
        neededTenants: null,
        gender: null,
        period: null,
        utilitiesIncluded: false,
        depositMonths: null,
        floor: null,
        totalFloors: null,
        amenities: [],
        availableFrom: null,
      },
    });

    const errors = validateForPublish(broken, NOW);

    expect(errors[ListingField.TITLE]).toBe(MSG.TITLE_REQUIRED);
    expect(errors[ListingField.IMAGES]).toBe(MSG.IMAGES_REQUIRED);
    expect(errors[ListingField.LOCATION]).toBe(MSG.LOCATION_REQUIRED_RENTAL);
    expect(errors[ListingField.PROPERTY_TYPE]).toBe(MSG.PROPERTY_TYPE_REQUIRED);
    expect(errors[ListingField.GENDER]).toBe(MSG.GENDER_REQUIRED);
  });

  it('dispatches to the rule set matching details.kind', () => {
    const job = validRental({
      kind: StudentListingKind.JOB,
      images: [],
      details: {
        kind: StudentListingKind.JOB,
        employment: null,
        categoryKey: null,
        companyName: null,
        shift: null,
        schedule: { days: [], startTime: null, endTime: null, hoursPerDay: null },
        payPeriod: null,
        vacancies: null,
        gender: null,
        experience: null,
        ageFrom: null,
        ageTo: null,
        requirements: [],
        benefits: [],
        workDate: null,
        payoutNote: null,
      },
    });

    const errors = validateForPublish(job, NOW);

    expect(errors[ListingField.JOB_CATEGORY]).toBe(MSG.JOB_CATEGORY_REQUIRED);
    // RENTAL-only fields must not leak into a JOB's errors.
    expect(errors[ListingField.GENDER]).toBeUndefined();
    expect(errors[ListingField.PROPERTY_TYPE]).toBeUndefined();
  });

  describe('a TASK may not outlive its own deadline (§6)', () => {
    function task(deadline: Date, validTo: Date) {
      return validRental({
        kind: StudentListingKind.TASK,
        description: 'Analiz, aniqmas integrallar',
        validFrom: new Date('2026-08-01T00:00:00Z'),
        validTo,
        branches: [],
        details: {
          kind: StudentListingKind.TASK,
          category: TaskCategory.EXACT,
          typeKey: 'MATH',
          customTypeName: null,
          deadline,
          format: TaskFormat.ONLINE,
          volume: null,
        },
      });
    }

    it('rejects a validity window running past the deadline', () => {
      const listing = task(new Date('2026-08-14T18:00:00Z'), new Date('2026-08-20T00:00:00Z'));
      expect(validateForPublish(listing, NOW)[ListingField.VALIDITY]).toBe(
        MSG.VALIDITY_AFTER_DEADLINE,
      );
    });

    it('accepts a window ending on the deadline', () => {
      const deadline = new Date('2026-08-14T18:00:00Z');
      expect(
        validateForPublish(task(deadline, deadline), NOW)[ListingField.VALIDITY],
      ).toBeUndefined();
    });

    it('leaves the common validity message in place when both rules fail', () => {
      // mergeFirstWins: the more general "end after start" complaint is the one to act on first.
      const listing = task(new Date('2026-08-14T18:00:00Z'), new Date('2026-07-01T00:00:00Z'));
      expect(validateForPublish(listing, NOW)[ListingField.VALIDITY]).toBe(MSG.VALIDITY_ORDER);
    });

    it('does not apply the deadline cap to other kinds', () => {
      expect(validateForPublish(validRental(), NOW)[ListingField.VALIDITY]).toBeUndefined();
    });
  });
});
