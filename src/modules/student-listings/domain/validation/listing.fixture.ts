import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import type { StudentListingBranch } from '../entities/student-listing-branch.entity';
import type { StudentListing } from '../entities/student-listing.entity';
import { PropertyType, RentPeriod, TenantGender } from '../enums/detail.enums';
import { ListingAudience } from '../enums/listing-audience.enum';
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../enums/student-price-unit.enum';

/**
 * Test fixtures for the validation rules. Shared rather than copied into each spec: five spec
 * files need the same publishable listing, and a builder that drifted between them would let a
 * rule pass in one file and fail in another for reasons unrelated to the rule.
 *
 * Not a `.spec.ts`, so Jest does not try to run it as a suite.
 */

/** A pin in Chilonzor — inside Uzbekistan, so it satisfies the location rules by default. */
export function pin(
  lat = 41.2856,
  lng = 69.2034,
  overrides: Partial<StudentListingBranch> = {},
): StudentListingBranch {
  return {
    id: 'br_1',
    lat,
    lng,
    address: 'Chilonzor 9-kvartal, 42-uy',
    name: null,
    landmark: null,
    regionId: 'TOSHKENT_SHAHRI',
    districtId: 'CHILONZOR',
    ...overrides,
  };
}

/**
 * A RENTAL listing that passes every publish rule. Tests break one field at a time, so anything
 * failing here is the rule under test and nothing else.
 */
export function validRental(overrides: Partial<StudentListing> = {}): StudentListing {
  return {
    id: 'lst_1',
    ownerId: 'usr_1',
    kind: StudentListingKind.RENTAL,
    title: 'Chilonzorda 3 xonali kvartiraga sherik kerak',
    description: null,
    images: ['https://cdn.example/1.jpg'],
    priceUnit: StudentPriceUnit.PER_MONTH,
    price: 1_500_000,
    priceMax: null,
    currency: 'UZS',
    isNegotiable: false,
    contactPhone: '+998901234567',
    universityId: null,
    audience: ListingAudience.ALL,
    branches: [pin()],
    validFrom: new Date('2026-08-01T00:00:00Z'),
    validTo: new Date('2026-09-01T00:00:00Z'),
    attributes: {},
    optionGroups: [],
    details: {
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
    },
    status: ListingStatus.DRAFT,
    rejectionReason: null,
    viewsCount: 0,
    publishedAt: null,
    createdAt: new Date('2026-07-30T09:12:00Z'),
    updatedAt: new Date('2026-07-30T09:12:00Z'),
    ...overrides,
  };
}
