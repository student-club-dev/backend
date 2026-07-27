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
import { Category } from '../../catalog/domain/entities/category.entity';
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
  StatusTransitionCounts,
} from '../domain/listing.repository';
import { computeFinalPrice } from '../domain/pricing/final-price';
import {
  REGULAR_KEY,
  REGULAR_VALUE,
  RESERVED_ATTRIBUTE_KEYS,
} from '../domain/reserved-attribute-keys';
import { validateAttributes } from './attribute-validation';
import {
  CreateListingInput,
  ListingStatsResult,
  OptionGroupInput,
  RedemptionInput,
  UpdateListingInput,
} from './listings.io';

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
    const summary = await this.assertBusinessOwned(user, businessId);

    // 2. Shared create/edit validation (§10) → normalised discount + option groups + haystack.
    const { discount, optionGroups, searchText } = await this.validateAndResolve(summary, input);

    // 3. Persist the whole aggregate atomically as DRAFT.
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
      searchText,
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

  /** The business must exist (404) and belong to the caller (403). Returns its summary. */
  private async assertBusinessOwned(
    user: AuthenticatedUser,
    businessId: string,
  ): Promise<BusinessSummary> {
    const summary = await this.businesses.findSummaryById(businessId);
    if (summary === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (summary.ownerId !== user.id) {
      throw AppException.forbidden();
    }
    return summary;
  }

  /**
   * Full-replace edit of a listing the caller owns. The listing must exist and not be ARCHIVED
   * (404), and its business must belong to the caller (403). The payload is re-validated exactly
   * like create — so the stored listing stays internally valid — and `finalPrice` is recomputed;
   * `status`, `currency` and the counters are preserved (the owner edits content, not lifecycle).
   */
  async update(
    user: AuthenticatedUser,
    listingId: string,
    input: UpdateListingInput,
  ): Promise<Listing> {
    const { summary } = await this.loadOwnedListing(user, listingId);
    const { discount, optionGroups, searchText } = await this.validateAndResolve(summary, input);
    return this.listings.update(listingId, {
      branchIds: input.branchIds,
      categoryKey: input.categoryKey,
      customCategoryName: input.customCategoryName,
      title: input.title,
      description: input.description,
      images: input.images,
      priceUnit: input.priceUnit,
      originalPrice: input.originalPrice,
      discount,
      redemption: input.redemption,
      validFrom: input.validFrom,
      validTo: input.validTo,
      attributes: input.attributes,
      optionGroups,
      searchText,
    });
  }

  /** Soft-deletes (ARCHIVED) a listing the caller owns. */
  async archive(user: AuthenticatedUser, listingId: string): Promise<void> {
    await this.loadOwnedListing(user, listingId);
    await this.listings.archive(listingId);
  }

  /**
   * Pauses a live listing (ACTIVE → PAUSED). Any other status is an invalid transition (409) — only a
   * live listing can be paused. Returns the updated listing.
   */
  async pause(user: AuthenticatedUser, listingId: string): Promise<Listing> {
    const { listing } = await this.loadOwnedListing(user, listingId);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Faqat faol e’lonni to‘xtatib turish mumkin',
      );
    }
    return this.listings.setStatus(listingId, ListingStatus.PAUSED);
  }

  /**
   * Resumes a paused listing. It goes back to ACTIVE, or to SCHEDULED when its `validFrom` is still in
   * the future (the cron starts it on time — mirroring submit). Any other status is an invalid
   * transition (409). Returns the updated listing.
   */
  async activate(user: AuthenticatedUser, listingId: string): Promise<Listing> {
    const { listing } = await this.loadOwnedListing(user, listingId);
    if (listing.status !== ListingStatus.PAUSED) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Faqat to‘xtatilgan e’lonni qayta faollashtirish mumkin',
      );
    }
    const target = listing.validFrom > new Date() ? ListingStatus.SCHEDULED : ListingStatus.ACTIVE;
    return this.listings.setStatus(listingId, target);
  }

  /**
   * Withdraws a listing from review back to a draft (PENDING_REVIEW → DRAFT) so the owner can edit and
   * resubmit. Any other status is an invalid transition (409). Returns the updated listing.
   */
  async withdraw(user: AuthenticatedUser, listingId: string): Promise<Listing> {
    const { listing } = await this.loadOwnedListing(user, listingId);
    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Faqat ko‘rib chiqishdagi e’lonni qaytarib olish mumkin',
      );
    }
    return this.listings.setStatus(listingId, ListingStatus.DRAFT);
  }

  /**
   * Clones a listing the caller owns into a fresh DRAFT (content, branches and option groups copied;
   * `usedCount`/`viewsCount` reset). Used to re-publish an EXPIRED/SOLD_OUT offer; the owner edits and
   * submits the copy independently. Returns the new listing.
   */
  async duplicate(user: AuthenticatedUser, listingId: string): Promise<Listing> {
    await this.loadOwnedListing(user, listingId);
    return this.listings.duplicate(listingId);
  }

  /**
   * Owner analytics for a listing the caller owns (ListingStatsDto): views, favourites, confirmed
   * redemptions and their revenue, plus the derived `conversionRate` (0 when there are no views).
   */
  async stats(user: AuthenticatedUser, listingId: string): Promise<ListingStatsResult> {
    await this.loadOwnedListing(user, listingId);
    const stats = await this.listings.stats(listingId);
    return {
      listingId,
      viewsCount: stats.viewsCount,
      favoritesCount: stats.favoritesCount,
      redemptionsCount: stats.redemptionsCount,
      conversionRate: stats.viewsCount === 0 ? 0 : stats.redemptionsCount / stats.viewsCount,
      totalRevenue: stats.totalRevenue,
    };
  }

  /**
   * Applies the scheduled status transitions (BACKEND_PROMPT §7) as of now. Invoked by the cron, not
   * by any request — no ownership check: it is a system-wide sweep. Returns the per-transition counts
   * for the caller to log.
   */
  runStatusTransitions(): Promise<StatusTransitionCounts> {
    return this.listings.applyStatusTransitions(new Date());
  }

  /**
   * Loads a listing for a write: it must exist and not be ARCHIVED (else 404 — an archived listing
   * is treated as deleted, mirroring business archive), and its business must belong to the caller
   * (else 403). Returns the listing and its business summary.
   */
  private async loadOwnedListing(
    user: AuthenticatedUser,
    listingId: string,
  ): Promise<{ listing: Listing; summary: BusinessSummary }> {
    const listing = await this.listings.findById(listingId);
    if (listing === null || listing.status === ListingStatus.ARCHIVED) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    const summary = await this.businesses.findSummaryById(listing.businessId);
    if (summary === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (summary.ownerId !== user.id) {
      throw AppException.forbidden();
    }
    return { listing, summary };
  }

  /**
   * Shared create/edit validation (LISTINGS.md §10): category + custom-name, scalar rules, pricing
   * (§4/§5), attributes against the catalog schema (§6), redemption (§7), option groups (§8) and
   * branchIds ownership (§9). Returns the normalised discount (with the server-computed finalPrice),
   * the option groups to persist and the search haystack (§7 of STUDENT_FEED.md).
   */
  private async validateAndResolve(
    summary: BusinessSummary,
    input: UpdateListingInput,
  ): Promise<{
    discount: ListingDiscount;
    optionGroups: CreateOptionGroupData[];
    searchText: string;
  }> {
    const category = await this.assertCategory(summary.type, input);
    this.assertScalars(input);
    const isRegular = input.attributes?.[REGULAR_KEY] === REGULAR_VALUE;
    const discount = this.resolveDiscount(input, isRegular);
    const specs = await this.catalog.findAttributeSpecs(summary.type, input.categoryKey);
    validateAttributes(input.attributes, specs);
    this.assertRedemption(input.redemption);
    const optionGroups = this.resolveOptionGroups(input.optionGroups);
    await this.assertBranchIds(summary.id, input.branchIds);
    return { discount, optionGroups, searchText: buildSearchText(input, category.nameUz) };
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

    // 5. Publish (persisting the branch snapshot when one was resolved).
    //
    // TODO(post-MVP): route this through moderation — DRAFT → PENDING_REVIEW, and an admin
    // approve/reject moves it on. For the MVP a submitted listing goes live immediately, exactly
    // as businesses are auto-approved on create (commit 5315542). Without this the pipeline dead-
    // ends: nothing else in the codebase ever sets ACTIVE, so no listing could reach the student
    // feed, which only shows ACTIVE ones (STUDENT_FEED.md Q4).
    //
    // SCHEDULED when the owner dated the listing forward — publishing must not start it early.
    // NOTE: SCHEDULED → ACTIVE needs the cron from BACKEND_PROMPT §7, which does not exist yet.
    const publishedStatus =
      listing.validFrom > new Date() ? ListingStatus.SCHEDULED : ListingStatus.ACTIVE;

    return this.listings.submitTransition(listingId, {
      branchIds: branchSnapshot,
      status: publishedStatus,
    });
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

  /**
   * §10 gate 6 (submit): the category must still exist in the catalog for the business type.
   * Returns it, so callers that need its label (the search haystack) get it without a second lookup.
   */
  private async assertCategoryInCatalog(type: string, categoryKey: string): Promise<Category> {
    const categories = await this.catalog.findCategoriesByType(type);
    const found = categories?.find((category) => category.key === categoryKey);
    if (found === undefined) {
      throw new AppException(
        ERROR_CODE.INVALID_CATEGORY_FOR_TYPE,
        422,
        'Kategoriya ushbu biznes turida mavjud emas',
        { categoryKey: 'Kategoriya katalogda topilmadi' },
      );
    }
    return found;
  }

  /** §10: `categoryKey` must be in the catalog for the type; OTHER requires `customCategoryName`. */
  private async assertCategory(type: string, input: UpdateListingInput): Promise<Category> {
    const category = await this.assertCategoryInCatalog(type, input.categoryKey);
    if (
      input.categoryKey === OTHER_CATEGORY_KEY &&
      (input.customCategoryName === null || input.customCategoryName.trim() === '')
    ) {
      throw AppException.validation({ customCategoryName: 'OTHER uchun nom majburiy' });
    }
    return category;
  }

  /** §10: title length, positive price, image count and the validity window. */
  private assertScalars(input: UpdateListingInput): void {
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
  private resolveDiscount(input: UpdateListingInput, isRegular: boolean): ListingDiscount {
    if (isRegular) {
      return {
        type: DiscountType.PERCENT,
        value: 0,
        finalPrice: input.originalPrice,
        conditions: null,
        appliesToOptions: false,
        isDiscount: false,
        percent: null,
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
      isDiscount: true,
      percent: normalisedPercent(discount.type, originalPrice, finalPrice),
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

/**
 * The search haystack persisted as `listing.search_text` (STUDENT_FEED.md §7) — everything a student
 * might type to find this listing: its title and description, the category (key + label) or the
 * custom name, the non-reserved attribute values and every option group / option name. Reserved keys
 * are left out on purpose: `_phone` is contact data and `_regular` / `_gender` are flags — none is
 * something anybody searches for. The DB trigger derives `search_vector` from the result.
 *
 * Category synonyms are deliberately NOT baked in: they belong to the catalog and are joined at
 * query time, so a copy here would go stale the moment an admin edits them.
 */
function buildSearchText(input: UpdateListingInput, categoryLabel: string): string {
  const parts: Array<string | null> = [
    input.title,
    input.description,
    input.categoryKey,
    categoryLabel,
    input.customCategoryName,
  ];
  for (const [key, value] of Object.entries(input.attributes ?? {})) {
    if (!RESERVED_ATTRIBUTE_KEYS.includes(key)) {
      parts.push(value);
    }
  }
  for (const group of input.optionGroups) {
    parts.push(group.name, ...group.options.map((option) => option.name));
  }
  return parts.filter((part): part is string => part !== null && part.trim() !== '').join(' ');
}

/**
 * Discount percent used for feed sorting and faceting (STUDENT_FEED.md §6). FIXED_AMOUNT and
 * SPECIAL_PRICE are expressed as the equivalent percent so the three are comparable; FREE_ITEM
 * (1+1) has no price drop at all, so it takes the flat 50 the sort rule assigns it.
 */
function normalisedPercent(type: DiscountType, originalPrice: number, finalPrice: number): number {
  if (type === DiscountType.FREE_ITEM) {
    return 50;
  }
  if (originalPrice <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(((originalPrice - finalPrice) * 100) / originalPrice));
}
