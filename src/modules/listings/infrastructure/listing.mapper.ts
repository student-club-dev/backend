import {
  DiscountType as PrismaDiscountType,
  ListingStatus as PrismaListingStatus,
  PriceUnit as PrismaPriceUnit,
  Prisma,
  RedemptionMethod as PrismaRedemptionMethod,
  RedemptionPeriod as PrismaRedemptionPeriod,
  SelectionType as PrismaSelectionType,
} from '@prisma/client';
import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { Listing, ListingOption, ListingOptionGroup } from '../domain/entities/listing.entity';
import { DiscountType } from '../domain/enums/discount-type.enum';
import { ListingStatus } from '../domain/enums/listing-status.enum';
import { RedemptionMethod } from '../domain/enums/redemption-method.enum';
import { RedemptionPeriod } from '../domain/enums/redemption-period.enum';
import { SelectionType } from '../domain/enums/selection-type.enum';
import { CreateListingData, UpdateListingData } from '../domain/listing.repository';

/**
 * The relations a listing is read with: its branch associations and its option groups (each with its
 * options, ordered by `sortOrder`). Reused by every read query so the mapper always has what it needs.
 */
export const LISTING_INCLUDE = {
  listingBranches: true,
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.ListingInclude;

type ListingRowWithRelations = Prisma.ListingGetPayload<{ include: typeof LISTING_INCLUDE }>;
type OptionGroupRow = ListingRowWithRelations['optionGroups'][number];
type OptionRow = OptionGroupRow['options'][number];

/**
 * Maps between the Listing Prisma aggregate and the domain entity. Money columns are `BigInt` in
 * Prisma (whole so'm) and serialised to `number` in the domain; a submitted integer is stored back
 * as `BigInt`. The Prisma enums carry the same wire values as the domain enums (looked up by key),
 * and the `attributes` JSONB column is normalised to a `string → string` map both ways.
 */
export class ListingMapper {
  static toDomain(row: ListingRowWithRelations): Listing {
    return {
      id: row.id,
      businessId: row.businessId,
      branchIds: row.listingBranches.map((association) => association.branchId),
      categoryKey: row.categoryKey,
      customCategoryName: row.customCategoryName,
      title: row.title,
      description: row.description,
      images: row.images,
      priceUnit: PriceUnit[row.priceUnit],
      originalPrice: Number(row.originalPrice),
      currency: row.currency,
      discount: {
        type: DiscountType[row.discountType],
        value: Number(row.discountValue),
        finalPrice: Number(row.finalPrice),
        conditions: row.discountConditions,
        appliesToOptions: row.appliesToOptions,
        isDiscount: row.isDiscount,
        percent: row.discountPercent,
      },
      redemption: {
        method: RedemptionMethod[row.redemptionMethod],
        promoCode: row.promoCode,
        url: row.redemptionUrl,
        perUserLimit: row.perUserLimit,
        perUserPeriod: row.perUserPeriod === null ? null : RedemptionPeriod[row.perUserPeriod],
        totalLimit: row.totalLimit,
        usedCount: row.usedCount,
      },
      validFrom: row.validFrom,
      validTo: row.validTo,
      attributes: toAttributes(row.attributes),
      optionGroups: row.optionGroups.map(toOptionGroup),
      status: ListingStatus[row.status],
      rejectionReason: row.rejectionReason,
      viewsCount: row.viewsCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Domain aggregate → Prisma nested create payload (listing + branches + option groups + options). */
  static toCreateData(data: CreateListingData): Prisma.ListingUncheckedCreateInput {
    return {
      businessId: data.businessId,
      categoryKey: data.categoryKey,
      customCategoryName: data.customCategoryName,
      title: data.title,
      description: data.description,
      images: data.images,
      priceUnit: PrismaPriceUnit[data.priceUnit],
      originalPrice: BigInt(data.originalPrice),
      currency: data.currency,
      discountType: PrismaDiscountType[data.discount.type],
      discountValue: BigInt(data.discount.value),
      finalPrice: BigInt(data.discount.finalPrice),
      isDiscount: data.discount.isDiscount,
      discountPercent: data.discount.percent,
      discountConditions: data.discount.conditions,
      appliesToOptions: data.discount.appliesToOptions,
      redemptionMethod: PrismaRedemptionMethod[data.redemption.method],
      promoCode: data.redemption.promoCode,
      redemptionUrl: data.redemption.url,
      perUserLimit: data.redemption.perUserLimit,
      perUserPeriod:
        data.redemption.perUserPeriod === null
          ? null
          : PrismaRedemptionPeriod[data.redemption.perUserPeriod],
      totalLimit: data.redemption.totalLimit,
      usedCount: data.redemption.usedCount,
      attributes: attributesToJson(data.attributes),
      searchText: data.searchText,
      validFrom: data.validFrom,
      validTo: data.validTo,
      status: PrismaListingStatus[data.status],
      listingBranches:
        data.branchIds.length === 0
          ? undefined
          : { create: data.branchIds.map((branchId) => ({ branchId })) },
      optionGroups:
        data.optionGroups.length === 0
          ? undefined
          : { create: optionGroupsCreate(data.optionGroups) },
    };
  }

  /**
   * Editable listing columns → Prisma update payload. Replaces the ListingBranch and OptionGroup
   * rows wholesale (`deleteMany` then `create`; options cascade-delete with their group). Never
   * writes `status`, `usedCount`, `viewsCount` or `currency` — those are preserved.
   */
  static toUpdateData(data: UpdateListingData): Prisma.ListingUncheckedUpdateInput {
    return {
      categoryKey: data.categoryKey,
      customCategoryName: data.customCategoryName,
      title: data.title,
      description: data.description,
      images: data.images,
      priceUnit: PrismaPriceUnit[data.priceUnit],
      originalPrice: BigInt(data.originalPrice),
      discountType: PrismaDiscountType[data.discount.type],
      discountValue: BigInt(data.discount.value),
      finalPrice: BigInt(data.discount.finalPrice),
      isDiscount: data.discount.isDiscount,
      discountPercent: data.discount.percent,
      discountConditions: data.discount.conditions,
      appliesToOptions: data.discount.appliesToOptions,
      redemptionMethod: PrismaRedemptionMethod[data.redemption.method],
      promoCode: data.redemption.promoCode,
      redemptionUrl: data.redemption.url,
      perUserLimit: data.redemption.perUserLimit,
      perUserPeriod:
        data.redemption.perUserPeriod === null
          ? null
          : PrismaRedemptionPeriod[data.redemption.perUserPeriod],
      totalLimit: data.redemption.totalLimit,
      attributes: attributesToJson(data.attributes),
      searchText: data.searchText,
      validFrom: data.validFrom,
      validTo: data.validTo,
      listingBranches: {
        deleteMany: {},
        create: data.branchIds.map((branchId) => ({ branchId })),
      },
      optionGroups: {
        deleteMany: {},
        create: optionGroupsCreate(data.optionGroups),
      },
    };
  }

  /**
   * A listing row → Prisma nested-create payload that clones its content as a fresh DRAFT
   * (LISTINGS.md duplicate). Every content column is copied straight through — including
   * `searchText`, so the DB re-derives `search_vector` — while ownership stays the same business, the
   * counters (`usedCount`, `viewsCount`) reset to their defaults, and the branch + option-group rows
   * are recreated from the source.
   */
  static toDuplicateData(row: ListingRowWithRelations): Prisma.ListingUncheckedCreateInput {
    return {
      businessId: row.businessId,
      categoryKey: row.categoryKey,
      customCategoryName: row.customCategoryName,
      title: row.title,
      description: row.description,
      images: row.images,
      priceUnit: row.priceUnit,
      originalPrice: row.originalPrice,
      currency: row.currency,
      discountType: row.discountType,
      discountValue: row.discountValue,
      finalPrice: row.finalPrice,
      isDiscount: row.isDiscount,
      discountPercent: row.discountPercent,
      discountConditions: row.discountConditions,
      appliesToOptions: row.appliesToOptions,
      redemptionMethod: row.redemptionMethod,
      promoCode: row.promoCode,
      redemptionUrl: row.redemptionUrl,
      perUserLimit: row.perUserLimit,
      perUserPeriod: row.perUserPeriod,
      totalLimit: row.totalLimit,
      attributes:
        row.attributes === null ? Prisma.DbNull : (row.attributes as Prisma.InputJsonValue),
      searchText: row.searchText,
      validFrom: row.validFrom,
      validTo: row.validTo,
      status: PrismaListingStatus.DRAFT,
      listingBranches:
        row.listingBranches.length === 0
          ? undefined
          : {
              create: row.listingBranches.map((association) => ({
                branchId: association.branchId,
              })),
            },
      optionGroups:
        row.optionGroups.length === 0 ? undefined : { create: optionGroupsClone(row.optionGroups) },
    };
  }
}

/** Prisma nested-create payload for a listing's option groups (each with its options). */
function optionGroupsCreate(
  groups: CreateListingData['optionGroups'],
): Prisma.OptionGroupCreateWithoutListingInput[] {
  return groups.map((group) => ({
    name: group.name,
    selectionType: PrismaSelectionType[group.selectionType],
    isRequired: group.isRequired,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    sortOrder: group.sortOrder,
    options: {
      create: group.options.map((option) => ({
        name: option.name,
        priceDelta: BigInt(option.priceDelta),
        isAvailable: option.isAvailable,
        sortOrder: option.sortOrder,
      })),
    },
  }));
}

/** Prisma nested-create payload cloning a listing's option groups (and options) from existing rows. */
function optionGroupsClone(
  groups: OptionGroupRow[],
): Prisma.OptionGroupCreateWithoutListingInput[] {
  return groups.map((group) => ({
    name: group.name,
    selectionType: group.selectionType,
    isRequired: group.isRequired,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    sortOrder: group.sortOrder,
    options: {
      create: group.options.map((option) => ({
        name: option.name,
        priceDelta: option.priceDelta,
        isAvailable: option.isAvailable,
        sortOrder: option.sortOrder,
      })),
    },
  }));
}

function toOptionGroup(group: OptionGroupRow): ListingOptionGroup {
  return {
    id: group.id,
    name: group.name,
    selectionType: SelectionType[group.selectionType],
    isRequired: group.isRequired,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    sortOrder: group.sortOrder,
    options: group.options.map(toOption),
  };
}

function toOption(option: OptionRow): ListingOption {
  return {
    id: option.id,
    name: option.name,
    priceDelta: Number(option.priceDelta),
    isAvailable: option.isAvailable,
    sortOrder: option.sortOrder,
  };
}

/** Reads the JSONB `attributes` column into a `string → string` map; non-string values are dropped. */
function toAttributes(value: Prisma.JsonValue | null): Record<string, string> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}

/** Serialises the attribute map to the JSONB column; `null` stores SQL NULL. */
function attributesToJson(
  attributes: Record<string, string> | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return attributes === null ? Prisma.DbNull : attributes;
}
