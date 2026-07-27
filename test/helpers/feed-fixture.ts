import {
  BusinessStatus,
  DayOfWeek,
  DiscountType,
  ListingStatus,
  PriceUnit,
  RedemptionMethod,
} from '@prisma/client';
import type { RedisService } from '../../src/infrastructure/cache/redis.service';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service';

const OWNER_EMAIL = 'e2e-feed-owner@example.com';
const STUDENT_EMAIL = 'e2e-feed-student@example.com';

/** Tashkent city centre — every fixture branch is placed relative to this. */
export const TASHKENT = { lat: 41.3111, lng: 69.2797 };

export interface FixtureBranch {
  key: string;
  name: string;
  lat: number;
  lng: number;
  /** Defaults to open 09:00–23:00 every day. `[]` means no hours at all. */
  hours?: { day: DayOfWeek; open: string | null; close: string | null; isClosed: boolean }[];
}

export interface FixtureListing {
  key: string;
  categoryKey: string;
  title: string;
  branchKeys: string[];
  originalPrice: number;
  finalPrice: number;
  isDiscount: boolean;
  discountType?: DiscountType;
  discountValue?: number;
  discountPercent?: number | null;
  attributes?: Record<string, string>;
  priceUnit?: PriceUnit;
  redemptionMethod?: RedemptionMethod;
  promoCode?: string | null;
  images?: string[];
  searchText?: string;
  /** ACTIVE unless a test needs an invisible listing (Q4 coverage). */
  status?: ListingStatus;
  validFromOffsetMs?: number;
  validToOffsetMs?: number;
  createdAtOffsetMs?: number;
  viewsCount?: number;
}

export interface FixtureBusiness {
  key: string;
  type: string;
  name: string;
  status?: BusinessStatus;
  branches: FixtureBranch[];
  listings: FixtureListing[];
}

export interface SeededFeed {
  studentId: string;
  /** fixture key → generated id, for assertions. */
  listingIds: Record<string, string>;
  businessIds: Record<string, string>;
  branchIds: Record<string, string>;
}

const DEFAULT_HOURS = (['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as DayOfWeek[]).map(
  (day) => ({ day, open: '09:00', close: '23:00', isClosed: false }),
);

/**
 * Builds a complete feed fixture: one owner, one student, and the given businesses with their
 * branches (including the `branch_working_hours` rows the feed reads) and listings.
 *
 * Rows are inserted directly rather than through the API because the feed reads state the write
 * endpoints cannot produce on their own — an APPROVED business, an ACTIVE listing, an expired one.
 *
 * The cached aggregates are dropped afterwards: their keys encode the query, not the data, so a
 * previous run's counts would otherwise be served for five minutes.
 */
export async function seedFeed(
  prisma: PrismaService,
  redis: RedisService,
  businesses: FixtureBusiness[],
): Promise<SeededFeed> {
  await removeFeed(prisma, redis);

  const owner = await prisma.businessOwner.create({
    data: { email: OWNER_EMAIL, phoneNumber: '+998900000101', phoneVerified: true },
  });
  const student = await prisma.student.create({
    data: { email: STUDENT_EMAIL, phoneNumber: '+998900000102', phoneVerified: true },
  });

  const region = await prisma.region.findFirstOrThrow();
  const district = await prisma.district.findFirstOrThrow({ where: { regionId: region.id } });

  const listingIds: Record<string, string> = {};
  const businessIds: Record<string, string> = {};
  const branchIds: Record<string, string> = {};
  const now = Date.now();

  for (const spec of businesses) {
    const business = await prisma.business.create({
      data: {
        ownerId: owner.id,
        type: spec.type,
        name: spec.name,
        phone: '+998900000101',
        status: spec.status ?? BusinessStatus.APPROVED,
      },
    });
    businessIds[spec.key] = business.id;

    for (const branchSpec of spec.branches) {
      const hours = branchSpec.hours ?? DEFAULT_HOURS;
      const branch = await prisma.branch.create({
        data: {
          businessId: business.id,
          name: branchSpec.name,
          regionId: region.id,
          districtId: district.id,
          address: `${branchSpec.name} manzili`,
          lat: branchSpec.lat,
          lng: branchSpec.lng,
          isActive: true,
          workingHours: hours,
        },
      });
      // `geo_point` is filled from lat/lng by the `branches_geo_point_biu` trigger, exactly as it
      // is in production — the fixture deliberately goes through the same path.
      branchIds[branchSpec.key] = branch.id;

      if (hours.length > 0) {
        await prisma.branchWorkingHour.createMany({
          data: hours.map((entry) => {
            const open = toMinutes(entry.open);
            const close = toMinutes(entry.close);
            return {
              branchId: branch.id,
              day: entry.day,
              openMinute: open,
              closeMinute: close,
              spansMidnight: open !== null && close !== null && close <= open,
              isClosed: entry.isClosed,
            };
          }),
        });
      }
    }

    for (const listing of spec.listings) {
      const row = await prisma.listing.create({
        data: {
          businessId: business.id,
          categoryKey: listing.categoryKey,
          title: listing.title,
          images: listing.images ?? ['cover.jpg'],
          priceUnit: listing.priceUnit ?? PriceUnit.PER_ITEM,
          originalPrice: BigInt(listing.originalPrice),
          discountType: listing.discountType ?? DiscountType.PERCENT,
          discountValue: BigInt(listing.discountValue ?? 0),
          finalPrice: BigInt(listing.finalPrice),
          redemptionMethod: listing.redemptionMethod ?? RedemptionMethod.STUDENT_ID,
          promoCode: listing.promoCode ?? null,
          attributes: listing.attributes ?? {},
          searchText: listing.searchText ?? `${listing.title} ${listing.categoryKey}`,
          validFrom: new Date(now + (listing.validFromOffsetMs ?? -86_400_000)),
          validTo: new Date(now + (listing.validToOffsetMs ?? 86_400_000)),
          createdAt: new Date(now + (listing.createdAtOffsetMs ?? 0)),
          status: listing.status ?? ListingStatus.ACTIVE,
          viewsCount: listing.viewsCount ?? 0,
          isDiscount: listing.isDiscount,
          discountPercent: listing.isDiscount ? (listing.discountPercent ?? 30) : null,
        },
      });
      listingIds[listing.key] = row.id;

      for (const branchKey of listing.branchKeys) {
        await prisma.listingBranch.create({
          data: { listingId: row.id, branchId: branchIds[branchKey] },
        });
      }
    }
  }

  await clearFeedCache(redis);
  return { studentId: student.id, listingIds, businessIds, branchIds };
}

/** Removes everything {@link seedFeed} created. Safe to call when nothing exists. */
export async function removeFeed(prisma: PrismaService, redis: RedisService): Promise<void> {
  // Businesses, branches, listings and favourites all cascade from these two roots.
  await prisma.businessOwner.deleteMany({ where: { email: OWNER_EMAIL } });
  await prisma.student.deleteMany({ where: { email: STUDENT_EMAIL } });
  await clearFeedCache(redis);
}

/** Drops the cached aggregates so the next read recomputes from the current data. */
export async function clearFeedCache(redis: RedisService): Promise<void> {
  await redis.delByPattern('discounts:facets:*');
  await redis.delByPattern('catalog:counts:*');
}

/** "09:00" → 540 minutes past midnight; null when the day has no hours. */
function toMinutes(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}
