import { Test } from '@nestjs/testing';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import type { RentalDetails, StudentListing } from '../domain/entities/student-listing.entity';
import { PropertyType, RentPeriod, TenantGender } from '../domain/enums/detail.enums';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import { STUDENT_LISTING_REPOSITORY } from '../domain/student-listing.repository';
import { validRental } from '../domain/validation/listing.fixture';
import { ListingField } from '../domain/validation/listing-field';
import { MSG } from '../domain/validation/messages';
import type { CreateListingInput } from './student-listing.io';
import { StudentListingsService } from './student-listings.service';

const OWNER = 'usr_1';
const STRANGER = 'usr_2';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An open window relative to now: already started, and inside the 90-day cap. Fixed calendar dates
 * would either fall outside the cap or drift out of the window as time passes, so the suite would
 * start failing on a date unrelated to any code change.
 */
const OPEN_FROM = new Date(Date.now() - DAY_MS);
const OPEN_TO = new Date(Date.now() + 60 * DAY_MS);

function makeRepository() {
  return {
    create: jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({ ...validRental(), ...data, id: 'lst_new' }),
    ),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    update: jest.fn((id: string, data: Record<string, unknown>) =>
      Promise.resolve({ ...validRental(), ...data, id }),
    ),
    setStatus: jest.fn((id: string, status: ListingStatus) =>
      Promise.resolve({ ...validRental(), id, status }),
    ),
    softDelete: jest.fn().mockResolvedValue(undefined),
    findPageByOwner: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    incrementViews: jest.fn().mockResolvedValue(undefined),
    // True = first view inside the 24h window, so the counter should move.
    registerView: jest.fn().mockResolvedValue(true),
    countActiveByOwner: jest.fn().mockResolvedValue(0),
    countPublishedSince: jest.fn().mockResolvedValue(0),
    existsDuplicate: jest.fn().mockResolvedValue(false),
    isBlockedBetween: jest.fn().mockResolvedValue(false),
    isOwnerActive: jest.fn().mockResolvedValue(true),
  };
}

type MockRepository = ReturnType<typeof makeRepository>;

async function build(repository: MockRepository): Promise<StudentListingsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StudentListingsService,
      { provide: STUDENT_LISTING_REPOSITORY, useValue: repository },
    ],
  }).compile();
  return moduleRef.get(StudentListingsService);
}

/**
 * RENTAL details, typed concretely. Spreading `validRental().details` would keep the union type,
 * which cannot be narrowed by an override, so the shape is spelled out here instead.
 */
function rentalDetails(overrides: Partial<RentalDetails> = {}): RentalDetails {
  return {
    kind: StudentListingKind.RENTAL,
    propertyType: PropertyType.APARTMENT,
    roomCount: 3,
    currentTenants: 2,
    neededTenants: 1,
    gender: TenantGender.MALE,
    period: RentPeriod.MONTHLY,
    utilitiesIncluded: false,
    depositMonths: null,
    floor: null,
    totalFloors: null,
    amenities: [],
    availableFrom: null,
    ...overrides,
  };
}

/** A publishable RENTAL create payload; tests break one field at a time. */
function createInput(overrides: Partial<CreateListingInput> = {}): CreateListingInput {
  const base = validRental();
  return {
    kind: StudentListingKind.RENTAL,
    submit: false,
    title: base.title,
    description: base.description,
    images: base.images,
    priceUnit: base.priceUnit,
    price: base.price,
    priceMax: null,
    isNegotiable: false,
    contactPhone: base.contactPhone,
    universityId: null,
    audience: base.audience,
    branches: base.branches.map(({ id: _id, ...rest }) => rest),
    validFrom: OPEN_FROM,
    validTo: OPEN_TO,
    attributes: {},
    optionGroups: [],
    details: base.details,
    ...overrides,
  };
}

/** A stored listing owned by OWNER, in the given status and publishable. */
function stored(overrides: Partial<StudentListing> = {}): StudentListing {
  return validRental({
    id: 'lst_1',
    ownerId: OWNER,
    validFrom: OPEN_FROM,
    validTo: OPEN_TO,
    ...overrides,
  });
}

describe('StudentListingsService', () => {
  describe('create', () => {
    it('saves a DRAFT without running publish validation', async () => {
      const repository = makeRepository();
      const service = await build(repository);

      await service.create(
        OWNER,
        createInput({
          submit: false,
          title: '',
          images: [],
          contactPhone: null,
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
        }),
        null,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ListingStatus.DRAFT, publishedAt: null }),
      );
    });

    it('publishes straight to ACTIVE — never PENDING_REVIEW', async () => {
      const repository = makeRepository();
      const service = await build(repository);

      await service.create(OWNER, createInput({ submit: true }), null);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ListingStatus.ACTIVE }),
      );
    });

    it('publishes to SCHEDULED when the window has not opened', async () => {
      const repository = makeRepository();
      const service = await build(repository);

      await service.create(
        OWNER,
        createInput({
          submit: true,
          validFrom: new Date(Date.now() + 10 * DAY_MS),
          validTo: new Date(Date.now() + 70 * DAY_MS),
        }),
        null,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ListingStatus.SCHEDULED }),
      );
    });

    it('rejects a failing submit with ListingField keys', async () => {
      const repository = makeRepository();
      const service = await build(repository);

      const call = service.create(
        OWNER,
        createInput({
          submit: true,
          details: rentalDetails({ gender: null }),
        }),
        null,
      );

      await expect(call).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_VALIDATION_FAILED,
        status: 422,
        fields: { [ListingField.GENDER]: MSG.GENDER_REQUIRED },
      });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects details.kind disagreeing with kind', async () => {
      const repository = makeRepository();
      const service = await build(repository);

      const call = service.create(OWNER, createInput({ kind: StudentListingKind.JOB }), null);

      await expect(call).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_KIND_MISMATCH,
        status: 422,
      });
    });

    it('returns the original listing when an Idempotency-Key is replayed', async () => {
      const repository = makeRepository();
      repository.findByIdempotencyKey.mockResolvedValue(stored({ id: 'lst_first' }));
      const service = await build(repository);

      const result = await service.create(OWNER, createInput({ submit: true }), 'key-123');

      expect(result.id).toBe('lst_first');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('enforces the anti-spam limits before creating', async () => {
      const repository = makeRepository();
      repository.countActiveByOwner.mockResolvedValue(20);
      const service = await build(repository);

      await expect(
        service.create(OWNER, createInput({ submit: true }), null),
      ).rejects.toMatchObject({ code: ERROR_CODE.LISTING_LIMIT_REACHED, status: 429 });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('patch', () => {
    it('rejects a kind change', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored());
      const service = await build(repository);

      await expect(
        service.patch(OWNER, 'lst_1', { kind: StudentListingKind.JOB }),
      ).rejects.toMatchObject({ code: ERROR_CODE.LISTING_KIND_IMMUTABLE, status: 409 });
    });

    it('re-validates an ACTIVE listing and leaves it ACTIVE', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.ACTIVE }));
      const service = await build(repository);

      await service.patch(OWNER, 'lst_1', { price: 1_200_000 });

      expect(repository.setStatus).toHaveBeenCalledWith('lst_1', ListingStatus.ACTIVE, null);
      expect(repository.setStatus).not.toHaveBeenCalledWith(
        'lst_1',
        ListingStatus.PENDING_REVIEW,
        expect.anything(),
      );
    });

    it('rejects an edit that would make a live listing invalid', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.ACTIVE }));
      const service = await build(repository);

      await expect(service.patch(OWNER, 'lst_1', { title: '' })).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_VALIDATION_FAILED,
        status: 422,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('lets a DRAFT stay invalid and stay a DRAFT', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.DRAFT }));
      const service = await build(repository);

      await service.patch(OWNER, 'lst_1', { title: '' });

      expect(repository.update).toHaveBeenCalled();
      expect(repository.setStatus).not.toHaveBeenCalled();
    });

    it('throws LISTING_FORBIDDEN when the caller is not the owner', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored());
      const service = await build(repository);

      await expect(service.patch(STRANGER, 'lst_1', { price: 1 })).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_FORBIDDEN,
        status: 403,
      });
    });
  });

  describe('setStatus', () => {
    it.each([
      [ListingStatus.ACTIVE, ListingStatus.PAUSED],
      [ListingStatus.PAUSED, ListingStatus.ACTIVE],
      [ListingStatus.ACTIVE, ListingStatus.ARCHIVED],
    ])('allows %s -> %s', async (from, to) => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: from }));
      const service = await build(repository);

      await expect(service.setStatus(OWNER, 'lst_1', to)).resolves.toBeDefined();
    });

    it('rejects EXPIRED -> ACTIVE', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.EXPIRED }));
      const service = await build(repository);

      await expect(service.setStatus(OWNER, 'lst_1', ListingStatus.ACTIVE)).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_STATUS_INVALID,
        status: 409,
      });
    });

    it('re-validates before putting a paused listing back in the feed', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.PAUSED, title: '' }));
      const service = await build(repository);

      await expect(service.setStatus(OWNER, 'lst_1', ListingStatus.ACTIVE)).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_VALIDATION_FAILED,
        status: 422,
      });
    });
  });

  describe('findVisible', () => {
    const active = () => stored({ ownerId: 'usr_owner', status: ListingStatus.ACTIVE });

    it('returns an ACTIVE listing to a stranger and counts the view', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(active());
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'lst_1')).resolves.toMatchObject({ id: 'lst_1' });
      expect(repository.incrementViews).toHaveBeenCalledWith('lst_1');
    });

    it('does not count a second view by the same student within 24h', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(active());
      repository.registerView.mockResolvedValue(false);
      const service = await build(repository);

      await service.findVisible(STRANGER, 'lst_1');

      // Otherwise the counter measures reopened tabs, not reach (§7.2.0).
      expect(repository.incrementViews).not.toHaveBeenCalled();
    });

    it('dedups views over a 24h window', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(active());
      const service = await build(repository);

      await service.findVisible(STRANGER, 'lst_1');

      const [, , since] = repository.registerView.mock.calls[0] as [string, string, Date];
      const hoursAgo = (Date.now() - since.getTime()) / (60 * 60 * 1000);
      expect(hoursAgo).toBeCloseTo(24, 1);
    });

    it('does not count the owner viewing their own listing', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.ACTIVE }));
      const service = await build(repository);

      await service.findVisible(OWNER, 'lst_1');

      expect(repository.incrementViews).not.toHaveBeenCalled();
    });

    it('returns the owner their own DRAFT', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored({ status: ListingStatus.DRAFT }));
      const service = await build(repository);

      await expect(service.findVisible(OWNER, 'lst_1')).resolves.toMatchObject({ id: 'lst_1' });
    });

    it('hides another student’s DRAFT behind a 404, not a 403', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(
        stored({ ownerId: 'usr_owner', status: ListingStatus.DRAFT }),
      );
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'lst_1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
    });

    it('404s a missing listing', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(null);
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'nope')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
    });

    it('hides a listing from a blocked viewer', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(active());
      repository.isBlockedBetween.mockResolvedValue(true);
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'lst_1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
      });
    });

    it('hides a listing whose owner is banned', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(active());
      repository.isOwnerActive.mockResolvedValue(false);
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'lst_1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
      });
    });

    it('hides a listing whose window has closed', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(
        stored({
          ownerId: 'usr_owner',
          status: ListingStatus.ACTIVE,
          validFrom: new Date(Date.now() - 30 * DAY_MS),
          validTo: new Date(Date.now() - DAY_MS),
        }),
      );
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'lst_1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
      });
    });

    it('hides a TASK past its deadline', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(
        stored({
          ownerId: 'usr_owner',
          status: ListingStatus.ACTIVE,
          kind: StudentListingKind.TASK,
          details: {
            kind: StudentListingKind.TASK,
            category: null,
            typeKey: null,
            customTypeName: null,
            deadline: new Date('2020-06-01T00:00:00Z'),
            format: null,
            volume: null,
          },
        }),
      );
      const service = await build(repository);

      await expect(service.findVisible(STRANGER, 'lst_1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
      });
    });

    it('nulls contactPhone on a listing that is not ACTIVE', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(
        stored({ status: ListingStatus.ARCHIVED, contactPhone: '+998901234567' }),
      );
      const service = await build(repository);

      // An archived listing must not remain a source of phone numbers (§7.2.0).
      await expect(service.findVisible(OWNER, 'lst_1')).resolves.toMatchObject({
        contactPhone: null,
      });
    });

    it('keeps contactPhone on an ACTIVE listing', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(
        stored({ status: ListingStatus.ACTIVE, contactPhone: '+998901234567' }),
      );
      const service = await build(repository);

      await expect(service.findVisible(OWNER, 'lst_1')).resolves.toMatchObject({
        contactPhone: '+998901234567',
      });
    });
  });

  describe('remove', () => {
    it('soft-deletes the owner’s listing', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored());
      const service = await build(repository);

      await service.remove(OWNER, 'lst_1');

      expect(repository.softDelete).toHaveBeenCalledWith('lst_1');
    });

    it('refuses to delete someone else’s listing', async () => {
      const repository = makeRepository();
      repository.findById.mockResolvedValue(stored());
      const service = await build(repository);

      await expect(service.remove(STRANGER, 'lst_1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_FORBIDDEN,
        status: 403,
      });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });
});
