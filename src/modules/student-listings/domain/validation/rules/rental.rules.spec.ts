import type { RentalDetails } from '../../entities/student-listing.entity';
import { PropertyType, RentPeriod, TenantGender } from '../../enums/detail.enums';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { ListingField } from '../listing-field';
import { MSG, tenantsExceedRooms } from '../messages';
import { rentalRules } from './rental.rules';

function details(overrides: Partial<RentalDetails> = {}): RentalDetails {
  return {
    kind: StudentListingKind.RENTAL,
    propertyType: PropertyType.APARTMENT,
    roomCount: 3,
    currentTenants: 2,
    neededTenants: 2,
    gender: TenantGender.MALE,
    period: RentPeriod.MONTHLY,
    utilitiesIncluded: false,
    depositMonths: 1,
    floor: 4,
    totalFloors: 9,
    amenities: ['WIFI'],
    availableFrom: null,
    ...overrides,
  };
}

describe('rentalRules (§5.4)', () => {
  it('passes a well-formed RENTAL', () => {
    expect(rentalRules(details())).toEqual({});
  });

  it('requires a property type', () => {
    expect(rentalRules(details({ propertyType: null }))[ListingField.PROPERTY_TYPE]).toBe(
      MSG.PROPERTY_TYPE_REQUIRED,
    );
  });

  describe('rooms', () => {
    it('requires a room count', () => {
      expect(rentalRules(details({ roomCount: null }))[ListingField.ROOMS]).toBe(
        MSG.ROOMS_REQUIRED,
      );
    });

    it.each([0, 21, -1])('rejects %i rooms', (roomCount) => {
      expect(rentalRules(details({ roomCount }))[ListingField.ROOMS]).toBe(MSG.ROOMS_OUT_OF_RANGE);
    });

    it.each([1, 20])('accepts %i rooms', (roomCount) => {
      // currentTenants + neededTenants must still fit, so shrink them for the 1-room case.
      expect(
        rentalRules(details({ roomCount, currentTenants: 0, neededTenants: 1 }))[
          ListingField.ROOMS
        ],
      ).toBeUndefined();
    });
  });

  describe('tenants', () => {
    it.each([null, -1, 31])('rejects currentTenants %p', (currentTenants) => {
      expect(rentalRules(details({ currentTenants }))[ListingField.TENANTS]).toBe(
        MSG.CURRENT_TENANTS_REQUIRED,
      );
    });

    it.each([null, 0, 31])('rejects neededTenants %p', (neededTenants) => {
      expect(rentalRules(details({ neededTenants }))[ListingField.TENANTS]).toBe(
        MSG.NEEDED_TENANTS_REQUIRED,
      );
    });

    it('accepts an empty flat (currentTenants 0)', () => {
      expect(rentalRules(details({ currentTenants: 0 }))[ListingField.TENANTS]).toBeUndefined();
    });

    it('rejects more people than the rooms can hold', () => {
      // 2 rooms x 4 = capacity 8; 5 + 4 = 9 people.
      expect(
        rentalRules(details({ roomCount: 2, currentTenants: 5, neededTenants: 4 }))[
          ListingField.TENANTS
        ],
      ).toBe(tenantsExceedRooms(2, 9));
    });

    it('accepts exactly four people per room', () => {
      expect(
        rentalRules(details({ roomCount: 2, currentTenants: 4, neededTenants: 4 }))[
          ListingField.TENANTS
        ],
      ).toBeUndefined();
    });
  });

  it('requires a gender', () => {
    expect(rentalRules(details({ gender: null }))[ListingField.GENDER]).toBe(MSG.GENDER_REQUIRED);
  });

  describe('attributes', () => {
    it('rejects a floor above the building height', () => {
      expect(rentalRules(details({ floor: 10, totalFloors: 9 }))[ListingField.ATTRIBUTES]).toBe(
        MSG.FLOOR_ABOVE_TOTAL,
      );
    });

    it('accepts the top floor', () => {
      expect(
        rentalRules(details({ floor: 9, totalFloors: 9 }))[ListingField.ATTRIBUTES],
      ).toBeUndefined();
    });

    it('ignores the floor check when either value is missing', () => {
      expect(
        rentalRules(details({ floor: 10, totalFloors: null }))[ListingField.ATTRIBUTES],
      ).toBeUndefined();
    });

    it('rejects an unknown amenity key', () => {
      expect(
        rentalRules(details({ amenities: ['WIFI', 'JACUZZI'] }))[ListingField.ATTRIBUTES],
      ).toBe(MSG.CATALOG_KEY_UNKNOWN);
    });

    it('accepts an empty amenity list', () => {
      expect(rentalRules(details({ amenities: [] }))[ListingField.ATTRIBUTES]).toBeUndefined();
    });
  });
});
