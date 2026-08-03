import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import type { StudentListing } from '../domain/entities/student-listing.entity';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import {
  STUDENT_LISTING_REPOSITORY,
  type CreateStudentListingData,
  type StudentListingPage,
  type StudentListingRepository,
  type UpdateStudentListingData,
} from '../domain/student-listing.repository';
import { validateForPublish } from '../domain/validation/validate-for-publish';
import { buildSearchText } from '../infrastructure/student-listing.mapper';
import { assertMayPublish } from './anti-spam';
import type { CreateListingInput, PatchListingInput } from './student-listing.io';

/**
 * Which statuses an owner may move a listing between (§6).
 *
 * A missing source status means "nothing may be done from here" — DRAFT reaches the feed only via
 * `submit`, and REJECTED/PENDING_REVIEW are contract-only states this phase never writes. EXPIRED
 * deliberately cannot return to ACTIVE: the window has closed, so the owner edits the dates and
 * submits again rather than silently reviving a stale listing.
 */
const ALLOWED_OWNER_TRANSITIONS: Readonly<
  Partial<Record<ListingStatus, readonly ListingStatus[]>>
> = {
  [ListingStatus.ACTIVE]: [ListingStatus.PAUSED, ListingStatus.ARCHIVED],
  [ListingStatus.PAUSED]: [ListingStatus.ACTIVE, ListingStatus.ARCHIVED],
  [ListingStatus.SCHEDULED]: [ListingStatus.PAUSED, ListingStatus.ARCHIVED],
  [ListingStatus.EXPIRED]: [ListingStatus.ARCHIVED],
  [ListingStatus.DRAFT]: [ListingStatus.ARCHIVED],
};

/** §7.2.0 — a viewer counts once per this window, however many times they reopen the listing. */
const VIEW_DEDUP_HOURS = 24;

/** The states in which a listing is (or is about to be) publicly visible. */
const PUBLISHED_STATUSES: readonly ListingStatus[] = [
  ListingStatus.ACTIVE,
  ListingStatus.SCHEDULED,
];

/**
 * Create, edit and read a student's own listings.
 *
 * There is no moderation: a submit that passes validation and the anti-spam limits goes live in
 * the same request (spec §5). PENDING_REVIEW and REJECTED remain in the status enum for contract
 * parity with the client, but nothing here ever writes them.
 */
@Injectable()
export class StudentListingsService {
  constructor(
    @Inject(STUDENT_LISTING_REPOSITORY)
    private readonly repository: StudentListingRepository,
  ) {}

  async create(
    ownerId: string,
    input: CreateListingInput,
    idempotencyKey: string | null,
  ): Promise<StudentListing> {
    if (idempotencyKey !== null) {
      const existing = await this.repository.findByIdempotencyKey(ownerId, idempotencyKey);
      if (existing !== null) {
        // A retried request after a dropped response must not produce a second listing (§7.1).
        return existing;
      }
    }

    this.assertDetailsMatchKind(input.kind, input.details);

    const now = new Date();
    const candidate = this.toCandidate(ownerId, input, now);
    const status = input.submit
      ? await this.resolvePublishStatus(candidate, now)
      : ListingStatus.DRAFT;

    const data: CreateStudentListingData = {
      ownerId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      images: input.images,
      priceUnit: input.priceUnit,
      price: input.price,
      priceMax: input.priceMax,
      isNegotiable: input.isNegotiable,
      contactPhone: input.contactPhone,
      universityId: input.universityId,
      audience: input.audience,
      branches: input.branches,
      validFrom: input.validFrom,
      validTo: input.validTo,
      attributes: input.attributes,
      optionGroups: input.optionGroups,
      details: input.details,
      status,
      publishedAt: input.submit ? now : null,
      searchText: buildSearchText(candidate),
      idempotencyKey,
    };

    return this.repository.create(data);
  }

  /**
   * Partial edit. An ACTIVE or SCHEDULED listing is re-validated and returns to a published state
   * in the same request — there is no PENDING_REVIEW dwell (§10 Q2). A DRAFT stays a DRAFT and is
   * not validated, so a student can save a half-finished form as often as they like.
   */
  async patch(ownerId: string, id: string, input: PatchListingInput): Promise<StudentListing> {
    const existing = await this.loadOwned(ownerId, id);

    if (input.kind !== undefined && input.kind !== existing.kind) {
      throw new AppException(
        ERROR_CODE.LISTING_KIND_IMMUTABLE,
        409,
        'E’lon turini o‘zgartirib bo‘lmaydi',
      );
    }

    const merged = this.merge(existing, input);
    this.assertDetailsMatchKind(merged.kind, merged.details);

    const now = new Date();
    const wasPublished = PUBLISHED_STATUSES.includes(existing.status);
    if (wasPublished) {
      // Re-check before it goes back in front of anyone; an edit must not be a way around §5.
      this.assertPublishable(merged, now);
    }

    const data: UpdateStudentListingData = {
      title: merged.title,
      description: merged.description,
      images: merged.images,
      priceUnit: merged.priceUnit,
      price: merged.price,
      priceMax: merged.priceMax,
      isNegotiable: merged.isNegotiable,
      contactPhone: merged.contactPhone,
      universityId: merged.universityId,
      audience: merged.audience,
      branches: merged.branches.map(stripBranchId),
      validFrom: merged.validFrom,
      validTo: merged.validTo,
      attributes: merged.attributes,
      optionGroups: merged.optionGroups,
      details: merged.details,
      searchText: buildSearchText(merged),
    };

    const updated = await this.repository.update(id, data);

    if (!wasPublished) {
      return updated;
    }
    // Editing a scheduled listing whose start has since arrived should publish it, so the target
    // state is recomputed rather than assumed to be whatever it was.
    return this.repository.setStatus(id, this.publishedStatusFor(updated.validFrom, now), null);
  }

  /** DRAFT → live. Full §5 validation, then the §6 limits. */
  async submit(ownerId: string, id: string): Promise<StudentListing> {
    const listing = await this.loadOwned(ownerId, id);
    const now = new Date();

    const status = await this.resolvePublishStatus(listing, now);

    return this.repository.setStatus(id, status, now);
  }

  async setStatus(ownerId: string, id: string, target: ListingStatus): Promise<StudentListing> {
    const listing = await this.loadOwned(ownerId, id);

    const allowed = ALLOWED_OWNER_TRANSITIONS[listing.status] ?? [];
    if (!allowed.includes(target)) {
      throw new AppException(
        ERROR_CODE.LISTING_STATUS_INVALID,
        409,
        'Bu holatda bunday amal mumkin emas',
      );
    }

    const now = new Date();
    if (target === ListingStatus.ACTIVE) {
      // Un-pausing puts it back in the feed, so it must still satisfy every publish rule.
      this.assertPublishable(listing, now);
      return this.repository.setStatus(id, this.publishedStatusFor(listing.validFrom, now), null);
    }

    return this.repository.setStatus(id, target, null);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.loadOwned(ownerId, id);
    await this.repository.softDelete(id);
  }

  /** The owner sees everything they own, in every status — this is their management screen. */
  async findOwn(ownerId: string, page: number, size: number): Promise<StudentListingPage> {
    return this.repository.findPageByOwner(ownerId, { page, size });
  }

  /**
   * A single listing as this viewer may see it.
   *
   * Every failure — missing, deleted, unpublished, expired, blocked, banned owner — is reported as
   * the same 404. A 403 would confirm the listing exists, and §7.2.0 is explicit that a stranger
   * must not learn that much.
   */
  async findVisible(viewerId: string, id: string): Promise<StudentListing> {
    const listing = await this.repository.findById(id);
    if (listing === null) {
      throw this.notFound();
    }

    if (listing.ownerId === viewerId) {
      return this.redactContact(listing);
    }

    const now = new Date();
    if (!(await this.isVisibleToOthers(listing, viewerId, now))) {
      throw this.notFound();
    }

    // §7.2.0 — one view per person per 24h. Without the window the counter measures how often
    // someone reopened a tab, which tells the owner nothing about reach.
    const isFirstViewToday = await this.repository.registerView(
      id,
      viewerId,
      new Date(now.getTime() - VIEW_DEDUP_HOURS * 60 * 60 * 1000),
    );
    if (isFirstViewToday) {
      await this.repository.incrementViews(id);
    }

    return this.redactContact(listing);
  }

  // --- internals -------------------------------------------------------------------------------

  /** Validates, checks the §6 limits, and returns the status a published listing should land in. */
  private async resolvePublishStatus(listing: StudentListing, now: Date): Promise<ListingStatus> {
    this.assertPublishable(listing, now);
    await assertMayPublish(this.repository, listing, now);
    return this.publishedStatusFor(listing.validFrom, now);
  }

  private assertPublishable(listing: StudentListing, now: Date): void {
    const fields = validateForPublish(listing, now);
    if (Object.keys(fields).length > 0) {
      throw new AppException(
        ERROR_CODE.LISTING_VALIDATION_FAILED,
        422,
        'E’lonni tekshiring',
        fields,
      );
    }
  }

  /** A listing whose window has not opened waits as SCHEDULED; the cron promotes it (§6). */
  private publishedStatusFor(validFrom: Date | null, now: Date): ListingStatus {
    return validFrom !== null && validFrom.getTime() > now.getTime()
      ? ListingStatus.SCHEDULED
      : ListingStatus.ACTIVE;
  }

  private assertDetailsMatchKind(
    kind: StudentListingKind,
    details: { kind: StudentListingKind },
  ): void {
    if (details.kind !== kind) {
      throw new AppException(
        ERROR_CODE.LISTING_KIND_MISMATCH,
        422,
        'E’lon turi ma’lumotlar turiga mos emas',
      );
    }
  }

  private async loadOwned(ownerId: string, id: string): Promise<StudentListing> {
    const listing = await this.repository.findById(id);
    if (listing === null) {
      throw this.notFound();
    }
    if (listing.ownerId !== ownerId) {
      // A write to someone else's listing is 403: the caller already named a real id, so there is
      // nothing left to conceal, and a 404 here would just be confusing.
      throw new AppException(ERROR_CODE.LISTING_FORBIDDEN, 403, 'Bu e’lon sizniki emas');
    }
    return listing;
  }

  private async isVisibleToOthers(
    listing: StudentListing,
    viewerId: string,
    now: Date,
  ): Promise<boolean> {
    if (listing.status !== ListingStatus.ACTIVE) {
      return false;
    }
    if (listing.validFrom === null || listing.validFrom.getTime() > now.getTime()) {
      return false;
    }
    if (listing.validTo === null || listing.validTo.getTime() <= now.getTime()) {
      return false;
    }
    if (this.isExpiredTask(listing, now)) {
      return false;
    }
    if (!(await this.repository.isOwnerActive(listing.ownerId))) {
      return false;
    }
    return !(await this.repository.isBlockedBetween(viewerId, listing.ownerId));
  }

  /** A task whose deadline has passed is useless to whoever would take it on (§7.2.0). */
  private isExpiredTask(listing: StudentListing, now: Date): boolean {
    return (
      listing.details.kind === StudentListingKind.TASK &&
      listing.details.deadline !== null &&
      listing.details.deadline.getTime() <= now.getTime()
    );
  }

  /**
   * §7.2.0 — the phone number is only published while the listing is live, so an archived or
   * expired listing cannot be mined for numbers.
   */
  private redactContact(listing: StudentListing): StudentListing {
    if (listing.status === ListingStatus.ACTIVE) {
      return listing;
    }
    return { ...listing, contactPhone: null };
  }

  private notFound(): AppException {
    return new AppException(ERROR_CODE.LISTING_NOT_FOUND, 404, 'E’lon topilmadi');
  }

  /** Builds the entity a create is about to persist, so validation sees exactly what will be saved. */
  private toCandidate(ownerId: string, input: CreateListingInput, now: Date): StudentListing {
    return {
      id: '',
      ownerId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      images: input.images,
      priceUnit: input.priceUnit,
      price: input.price,
      priceMax: input.priceMax,
      currency: 'UZS',
      isNegotiable: input.isNegotiable,
      contactPhone: input.contactPhone,
      universityId: input.universityId,
      audience: input.audience,
      branches: input.branches.map((branch, index) => ({ id: `new-${index}`, ...branch })),
      validFrom: input.validFrom,
      validTo: input.validTo,
      attributes: input.attributes,
      optionGroups: input.optionGroups,
      details: input.details,
      status: ListingStatus.DRAFT,
      rejectionReason: null,
      viewsCount: 0,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Applies a partial edit. Only keys the client actually sent replace what is stored. */
  private merge(existing: StudentListing, input: PatchListingInput): StudentListing {
    return {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
      ...(input.priceUnit !== undefined ? { priceUnit: input.priceUnit } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.priceMax !== undefined ? { priceMax: input.priceMax } : {}),
      ...(input.isNegotiable !== undefined ? { isNegotiable: input.isNegotiable } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.universityId !== undefined ? { universityId: input.universityId } : {}),
      ...(input.audience !== undefined ? { audience: input.audience } : {}),
      ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
      ...(input.validTo !== undefined ? { validTo: input.validTo } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
      ...(input.optionGroups !== undefined ? { optionGroups: input.optionGroups } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.branches !== undefined
        ? { branches: input.branches.map((branch, index) => ({ id: `new-${index}`, ...branch })) }
        : {}),
    };
  }
}

/** Persisted pins carry an id the repository assigns; a write sends only the data. */
function stripBranchId(branch: {
  lat: number;
  lng: number;
  address: string;
  name: string | null;
  landmark: string | null;
  regionId: string | null;
  districtId: string | null;
}) {
  return {
    lat: branch.lat,
    lng: branch.lng,
    address: branch.address,
    name: branch.name,
    landmark: branch.landmark,
    regionId: branch.regionId,
    districtId: branch.districtId,
  };
}
