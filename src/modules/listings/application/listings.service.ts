import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BRANCH_REPOSITORY, BranchRepository } from '../../branches/domain/branches.repository';
import {
  BUSINESS_READ,
  BusinessReadRepository,
  BusinessSummary,
} from '../../business/domain/business-read.repository';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import { Listing, ListingDiscount } from '../domain/entities/listing.entity';
import { DiscountType } from '../domain/enums/discount-type.enum';
import { ListingStatus } from '../domain/enums/listing-status.enum';
import { RedemptionMethod } from '../domain/enums/redemption-method.enum';
import {
  CreateOptionGroupData,
  LISTING_REPOSITORY,
  ListingPage,
  ListingPageQuery,
  ListingRepository,
} from '../domain/listing.repository';
import { computeFinalPrice } from '../domain/pricing/final-price';
import { REGULAR_KEY, REGULAR_VALUE } from '../domain/reserved-attribute-keys';
import { validateAttributes } from './attribute-validation';
import { CreateListingInput, OptionGroupInput, RedemptionInput } from './listings.io';

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 120;
const MAX_IMAGES = 10;
const MAX_OPTION_GROUPS = 10;
const MAX_OPTIONS_PER_GROUP = 30;
const MAX_PERCENT = 90;
const OTHER_CATEGORY_KEY = 'OTHER';

/**
 * Listing use-cases. The BUSINESS-account gate lives in BusinessAccountGuard; here we enforce
 * ownership (the business must exist and belong to the caller) and the validation split from
 * LISTINGS.md §10 — CREATE keeps the stored draft internally consistent, SUBMIT re-validates the
 * publish gates from scratch (a draft may be weeks old, so it never trusts CREATE). Depends on
 * repository interfaces only.
 */
@Injectable()
export class ListingsService {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(BUSINESS_READ) private readonly businesses: BusinessReadRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
  ) {}

  /** Creates a DRAFT listing under a business the caller owns (LISTINGS.md §10). */
  async create(
    user: AuthenticatedUser,
    businessId: string,
    input: CreateListingInput,
  ): Promise<Listing> {
    // 1. Ownership — the business must exist (404) and belong to the caller (403). A draft may be
    //    created before the business is APPROVED.
    const summary = await this.businesses.findSummaryById(businessId);
    if (summary === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (summary.ownerId !== user.id) {
      throw AppException.forbidden();
    }

    // 2. Category must be in the catalog for the business type; OTHER requires a custom name.
    await this.assertCategory(summary.type, input);

    // 3. Scalar draft rules.
    this.assertScalars(input);

    // 4. Pricing / regular normalisation (§4/§5).
    const isRegular = input.attributes?.[REGULAR_KEY] === REGULAR_VALUE;
    const discount = this.resolveDiscount(input, isRegular);

    // 5. Attributes — full strict against the catalog schema (§6).
    const specs = await this.catalog.findAttributeSpecs(summary.type, input.categoryKey);
    validateAttributes(input.attributes, specs);

    // 6. Redemption configuration (§7).
    this.assertRedemption(input.redemption);

    // 7. Option groups (§8).
    const optionGroups = this.resolveOptionGroups(input.optionGroups);

    // 8. branchIds ownership (§9) — empty means "not specified yet".
    await this.assertBranchIds(businessId, input.branchIds);

    // 9. Persist the whole aggregate atomically as DRAFT.
    return this.listings.create({
      businessId,
      branchIds: input.branchIds,
      categoryKey: input.categoryKey,
      customCategoryName: input.customCategoryName,
      title: input.title,
      description: input.description,
      images: input.images,
      priceUnit: input.priceUnit,
      originalPrice: input.originalPrice,
      currency: input.currency,
      discount,
      redemption: { ...input.redemption, usedCount: 0 },
      validFrom: input.validFrom,
      validTo: input.validTo,
      attributes: input.attributes,
      optionGroups,
      status: ListingStatus.DRAFT,
    });
  }

  /**
   * A page of a business's listings the caller owns. Ownership is enforced first (the business must
   * exist → 404, and belong to the caller → 403); the repository applies the `status`/`categoryKey`
   * filters, paging and ordering. A `null` status excludes ARCHIVED, mirroring `business/my`.
   */
  async listByBusiness(
    user: AuthenticatedUser,
    businessId: string,
    query: ListingPageQuery,
  ): Promise<ListingPage> {
    await this.assertBusinessOwned(user, businessId);
    return this.listings.findPageByBusiness(businessId, query);
  }

  /** The business must exist (404) and belong to the caller (403). */
  private async assertBusinessOwned(user: AuthenticatedUser, businessId: string): Promise<void> {
    const summary = await this.businesses.findSummaryById(businessId);
    if (summary === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (summary.ownerId !== user.id) {
      throw AppException.forbidden();
    }
  }

  /**
   * Submits a DRAFT listing for review (LISTINGS.md §10 SUBMIT half). Re-validates every publish
   * gate independently — the draft is never trusted, since the category could have been removed, a
   * branch deactivated or the business un-approved since it was created. On success the listing
   * transitions DRAFT → PENDING_REVIEW (and, for the empty-branchIds case, the resolved active
   * branches are snapshotted onto it).
   */
  async submit(user: AuthenticatedUser, listingId: string): Promise<Listing> {
    // 1. The listing must exist.
    const listing = await this.listings.findById(listingId);
    if (listing === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }

    // 2. Ownership — the business must exist (404) and belong to the caller (403).
    const summary = await this.businesses.findSummaryById(listing.businessId);
    if (summary === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (summary.ownerId !== user.id) {
      throw AppException.forbidden();
    }

    // 3. Status guard — only a DRAFT may be submitted.
    if (listing.status !== ListingStatus.DRAFT) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Faqat qoralama e’lonni ko‘rib chiqishga yuborish mumkin',
      );
    }

    // 4. Publish gates (§10 SUBMIT), each re-validated from scratch.
    // 4.1 Business must be APPROVED.
    if (summary.status !== BusinessStatus.APPROVED) {
      throw new AppException(ERROR_CODE.BUSINESS_NOT_APPROVED, 403, 'Biznes hali tasdiqlanmagan');
    }
    // 4.2 Branches (§9 submit) — resolve the active-branch snapshot for the empty-branchIds case.
    const branchSnapshot = await this.resolveSubmitBranches(summary, listing.branchIds);
    // 4.3 At least one image.
    if (listing.images.length < 1) {
      throw AppException.validation({ images: 'Kamida bitta rasm kerak' });
    }
    // 4.4 finalPrice < originalPrice — recomputed from the stored discount; skipped for regulars.
    this.assertPublishablePrice(listing);
    // 4.5 validTo must be in the future.
    if (listing.validTo <= new Date()) {
      throw AppException.validation({ validTo: 'validTo kelajakda bo‘lishi kerak' });
    }
    // 4.6 categoryKey must still be in the catalog for the business type.
    await this.assertCategoryInCatalog(summary.type, listing.categoryKey);
    // 4.7 attributes must still match the catalog schema.
    const specs = await this.catalog.findAttributeSpecs(summary.type, listing.categoryKey);
    validateAttributes(listing.attributes, specs);

    // 5. Transition to PENDING_REVIEW (persisting the branch snapshot when one was resolved).
    return this.listings.submitTransition(listingId, { branchIds: branchSnapshot });
  }

  /**
   * §9 (submit half): resolves the branch gate. `isOnlineOnly` businesses need no branch. With
   * explicit `branchIds`, ≥ 1 must still be an active branch of the business. With none specified,
   * the business's current active branches are snapshotted and ≥ 1 is required. Returns the snapshot
   * to persist (only for the empty case), or `undefined` to leave the associations untouched.
   */
  private async resolveSubmitBranches(
    summary: BusinessSummary,
    branchIds: string[],
  ): Promise<string[] | undefined> {
    // Online-only businesses may publish without any branch — nothing to snapshot.
    if (summary.isOnlineOnly) {
      return undefined;
    }

    const branches = await this.branches.findManyByBusiness(summary.id);
    const activeIds = new Set(
      branches.filter((branch) => branch.isActive).map((branch) => branch.id),
    );

    if (branchIds.length > 0) {
      // Explicit associations — keep them, but require ≥ 1 to still be active.
      if (!branchIds.some((id) => activeIds.has(id))) {
        throw this.noActiveBranch();
      }
      return undefined;
    }

    // Not specified yet — snapshot the current active branches; require ≥ 1.
    const snapshot = [...activeIds];
    if (snapshot.length === 0) {
      throw this.noActiveBranch();
    }
    return snapshot;
  }

  private noActiveBranch(): AppException {
    return new AppException(ERROR_CODE.NO_ACTIVE_BRANCH, 422, 'Faol filial topilmadi');
  }

  /**
   * §10 gate 4 (submit): recomputes `finalPrice` from the stored discount and requires it to be
   * below `originalPrice`. Exempt — mirroring CREATE (§4) — for regular listings (`_regular == "1"`)
   * and FREE_ITEM (1+1); both legitimately have finalPrice == originalPrice.
   */
  private assertPublishablePrice(listing: Listing): void {
    if (
      listing.attributes?.[REGULAR_KEY] === REGULAR_VALUE ||
      listing.discount.type === DiscountType.FREE_ITEM
    ) {
      return;
    }
    const finalPrice = Number(
      computeFinalPrice(
        listing.discount.type,
        BigInt(listing.discount.value),
        BigInt(listing.originalPrice),
      ),
    );
    if (finalPrice >= listing.originalPrice) {
      throw new AppException(
        ERROR_CODE.FINAL_PRICE_INVALID,
        422,
        'Yakuniy narx asl narxdan kichik bo‘lishi kerak',
        { finalPrice: 'Chegirma yakuniy narxni kamaytirmaydi' },
      );
    }
  }

  /** §10 gate 6 (submit): the category must still exist in the catalog for the business type. */
  private async assertCategoryInCatalog(type: string, categoryKey: string): Promise<void> {
    const categories = await this.catalog.findCategoriesByType(type);
    const keys = categories?.map((category) => category.key) ?? [];
    if (!keys.includes(categoryKey)) {
      throw new AppException(
        ERROR_CODE.INVALID_CATEGORY_FOR_TYPE,
        422,
        'Kategoriya ushbu biznes turida mavjud emas',
        { categoryKey: 'Kategoriya katalogda topilmadi' },
      );
    }
  }

  /** §10: `categoryKey` must be in the catalog for the type; OTHER requires `customCategoryName`. */
  private async assertCategory(type: string, input: CreateListingInput): Promise<void> {
    await this.assertCategoryInCatalog(type, input.categoryKey);
    if (
      input.categoryKey === OTHER_CATEGORY_KEY &&
      (input.customCategoryName === null || input.customCategoryName.trim() === '')
    ) {
      throw AppException.validation({ customCategoryName: 'OTHER uchun nom majburiy' });
    }
  }

  /** §10: title length, positive price, image count and the validity window. */
  private assertScalars(input: CreateListingInput): void {
    if (input.title.length < MIN_TITLE_LENGTH || input.title.length > MAX_TITLE_LENGTH) {
      throw AppException.validation({
        title: `Sarlavha ${MIN_TITLE_LENGTH}-${MAX_TITLE_LENGTH} belgidan iborat bo‘lishi kerak`,
      });
    }
    if (input.originalPrice <= 0) {
      throw AppException.validation({ originalPrice: 'Narx 0 dan katta bo‘lishi kerak' });
    }
    if (input.images.length > MAX_IMAGES) {
      throw AppException.validation({
        images: `Rasmlar soni ${MAX_IMAGES} tadan oshmasligi kerak`,
      });
    }
    if (input.validTo <= input.validFrom) {
      throw AppException.validation({ validTo: 'validTo validFrom dan keyin bo‘lishi kerak' });
    }
    const maxValidTo = new Date(input.validFrom);
    maxValidTo.setFullYear(maxValidTo.getFullYear() + 1);
    if (input.validTo > maxValidTo) {
      throw AppException.validation({ validTo: 'validTo eng ko‘pi bilan 1 yil bo‘lishi mumkin' });
    }
  }

  /**
   * §4/§5: computes the discount to persist. Regular listings (`_regular == "1"`) are normalised to
   * a canonical no-discount form and skip the pricing gates; others are gated on the discount value
   * (PERCENT ≤ 90) and require `finalPrice < originalPrice` (all types except FREE_ITEM).
   */
  private resolveDiscount(input: CreateListingInput, isRegular: boolean): ListingDiscount {
    if (isRegular) {
      return {
        type: DiscountType.PERCENT,
        value: 0,
        finalPrice: input.originalPrice,
        conditions: null,
        appliesToOptions: false,
      };
    }

    const { discount, originalPrice } = input;
    if (discount.type === DiscountType.PERCENT && discount.value > MAX_PERCENT) {
      throw new AppException(
        ERROR_CODE.DISCOUNT_TOO_HIGH,
        422,
        'Chegirma 90% dan oshmasligi kerak',
        {
          value: 'Chegirma 90% dan oshmasligi kerak',
        },
      );
    }

    const finalPrice = Number(
      computeFinalPrice(discount.type, BigInt(discount.value), BigInt(originalPrice)),
    );
    if (discount.type !== DiscountType.FREE_ITEM && finalPrice >= originalPrice) {
      throw new AppException(
        ERROR_CODE.FINAL_PRICE_INVALID,
        422,
        'Yakuniy narx asl narxdan kichik bo‘lishi kerak',
        { value: 'Chegirma yakuniy narxni kamaytirmaydi' },
      );
    }

    return {
      type: discount.type,
      value: discount.value,
      finalPrice,
      conditions: discount.conditions,
      appliesToOptions: discount.appliesToOptions,
    };
  }

  /** §7: conditional required fields per method and non-negative limits. */
  private assertRedemption(redemption: RedemptionInput): void {
    if (
      redemption.method === RedemptionMethod.PROMO_CODE &&
      (redemption.promoCode === null || redemption.promoCode.trim() === '')
    ) {
      throw AppException.validation({ promoCode: 'PROMO_CODE uchun promoCode majburiy' });
    }
    if (
      redemption.method === RedemptionMethod.ONLINE_LINK &&
      (redemption.url === null || redemption.url.trim() === '')
    ) {
      throw AppException.validation({ url: 'ONLINE_LINK uchun url majburiy' });
    }
    if (redemption.perUserLimit !== null && redemption.perUserLimit < 0) {
      throw AppException.validation({ perUserLimit: 'Manfiy bo‘lishi mumkin emas' });
    }
    if (redemption.totalLimit !== null && redemption.totalLimit < 0) {
      throw AppException.validation({ totalLimit: 'Manfiy bo‘lishi mumkin emas' });
    }
  }

  /** §8: group/option counts and select-range coherence; normalises `sortOrder` by position. */
  private resolveOptionGroups(groups: OptionGroupInput[]): CreateOptionGroupData[] {
    if (groups.length > MAX_OPTION_GROUPS) {
      throw AppException.validation({
        optionGroups: `Guruhlar soni ${MAX_OPTION_GROUPS} tadan oshmasligi kerak`,
      });
    }
    return groups.map((group, index) => {
      const optionCount = group.options.length;
      if (optionCount > MAX_OPTIONS_PER_GROUP) {
        throw AppException.validation({
          optionGroups: `Har bir guruhda ${MAX_OPTIONS_PER_GROUP} tadan ko‘p variant bo‘lmaydi`,
        });
      }
      const { minSelect, maxSelect } = group;
      if (minSelect !== null && minSelect < 0) {
        throw AppException.validation({ optionGroups: 'minSelect manfiy bo‘lishi mumkin emas' });
      }
      if (maxSelect !== null && (maxSelect < 0 || maxSelect > optionCount)) {
        throw AppException.validation({
          optionGroups: 'maxSelect 0 va variantlar soni orasida bo‘lishi kerak',
        });
      }
      if (minSelect !== null && maxSelect !== null && minSelect > maxSelect) {
        throw AppException.validation({ optionGroups: 'minSelect maxSelect dan katta bo‘lmaydi' });
      }
      if (group.isRequired && (minSelect === null || minSelect < 1)) {
        throw AppException.validation({
          optionGroups: 'Majburiy guruhda minSelect kamida 1 bo‘lishi kerak',
        });
      }
      return {
        name: group.name,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelect,
        maxSelect,
        sortOrder: group.sortOrder ?? index,
        options: group.options.map((option, optionIndex) => ({
          name: option.name,
          priceDelta: option.priceDelta,
          isAvailable: option.isAvailable,
          sortOrder: option.sortOrder ?? optionIndex,
        })),
      };
    });
  }

  /** §9 (create half): every provided branch id must belong to the business. Empty = none. */
  private async assertBranchIds(businessId: string, branchIds: string[]): Promise<void> {
    if (branchIds.length === 0) {
      return;
    }
    const owned = await this.branches.findManyByBusiness(businessId);
    const ownedIds = new Set(owned.map((branch) => branch.id));
    if (branchIds.some((id) => !ownedIds.has(id))) {
      throw AppException.validation({ branchIds: 'Filial ushbu biznesga tegishli emas' });
    }
  }
}
