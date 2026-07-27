import {
  BusinessStatus,
  DiscountType,
  ListingStatus,
  PriceUnit,
  RedemptionMethod,
} from '@prisma/client';
import type { RedisService } from '../../src/infrastructure/cache/redis.service';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';

const OWNER_EMAIL = 'e2e-facet-owner@example.com';

export interface SeededListing {
  categoryKey: string;
  attributes: Record<string, string>;
  originalPrice: number;
  finalPrice: number;
  isDiscount: boolean;
  discountPercent: number | null;
}

/**
 * Creates one APPROVED business of `businessType` with an active branch and the given listings,
 * all ACTIVE and in date so they are visible per STUDENT_FEED.md Q4.
 *
 * The facet cache is dropped afterwards: its key encodes the query, not the data, so a run that
 * already asked for this scope would otherwise be served pre-fixture counts for five minutes.
 */
export async function seedFixture(
  prisma: PrismaService,
  redis: RedisService,
  businessType: string,
  listings: SeededListing[],
): Promise<string> {
  await removeFixture(prisma, redis);

  const owner = await prisma.businessOwner.create({
    data: { email: OWNER_EMAIL, phoneNumber: '+998900000099', phoneVerified: true },
  });

  const region = await prisma.region.findFirstOrThrow();
  const district = await prisma.district.findFirstOrThrow({ where: { regionId: region.id } });

  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      type: businessType,
      name: 'E2E Facet Biznes',
      phone: '+998900000099',
      status: BusinessStatus.APPROVED,
    },
  });

  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: 'Markaziy',
      regionId: region.id,
      districtId: district.id,
      address: 'Test manzil',
      lat: 41.3111,
      lng: 69.2797,
      isActive: true,
      workingHours: [],
    },
  });

  const now = Date.now();
  const validFrom = new Date(now - 86_400_000);
  const validTo = new Date(now + 86_400_000);

  for (const listing of listings) {
    const row = await prisma.listing.create({
      data: {
        businessId: business.id,
        categoryKey: listing.categoryKey,
        title: `E2E ${listing.categoryKey}`,
        priceUnit: PriceUnit.PER_ITEM,
        originalPrice: BigInt(listing.originalPrice),
        discountType: DiscountType.PERCENT,
        discountValue: BigInt(0),
        finalPrice: BigInt(listing.finalPrice),
        redemptionMethod: RedemptionMethod.STUDENT_ID,
        attributes: listing.attributes,
        validFrom,
        validTo,
        status: ListingStatus.ACTIVE,
        isDiscount: listing.isDiscount,
        discountPercent: listing.discountPercent,
      },
    });
    await prisma.listingBranch.create({ data: { listingId: row.id, branchId: branch.id } });
  }

  await clearFacetCache(redis);
  return business.id;
}

/** Removes everything {@link seedFixture} created. Safe to call when nothing exists. */
export async function removeFixture(prisma: PrismaService, redis: RedisService): Promise<void> {
  const owner = await prisma.businessOwner.findUnique({ where: { email: OWNER_EMAIL } });
  if (owner !== null) {
    // Listings, branches and businesses cascade from the owner.
    await prisma.businessOwner.delete({ where: { id: owner.id } });
  }
  await clearFacetCache(redis);
}

/** Drops the cached aggregates so the next read recomputes from the current data. */
async function clearFacetCache(redis: RedisService): Promise<void> {
  await redis.delByPattern('discounts:facets:*');
  await redis.delByPattern('catalog:counts:*');
}
