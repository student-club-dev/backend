import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import {
  BUSINESS_OWNER_REPOSITORY,
  BusinessOwnerRepository,
} from '../domain/business-owner.repository';
import { BUSINESS_REPOSITORY, BusinessRepository } from '../domain/business.repository';
import { Business } from '../domain/entities/business.entity';
import { BusinessStatus } from '../domain/enums/business-status.enum';
import { CreateBusinessInput, UpdateBusinessInput } from './business.io';

/** DISCOUNTS_BUSINESS_API §6.4 — "Bir foydalanuvchidagi biznes: 5". */
export const MAX_BUSINESSES_PER_OWNER = 5;

/**
 * Business use-cases for a business-owner account. The BUSINESS-account gate lives in
 * BusinessAccountGuard; here we enforce the business rules: the type must exist in the catalog,
 * the owner's phone must be verified before a first business is created (D1), `type` is immutable,
 * and DELETE archives (soft-delete) instead of removing. Depends on repository interfaces only.
 */
@Injectable()
export class BusinessService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(BUSINESS_OWNER_REPOSITORY) private readonly owners: BusinessOwnerRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Creates a business owned by the caller. Rejects an unknown `type` (422), an owner whose phone
   * is not verified (403, the D1 gate), and an owner already at the §6.4 cap of five (429).
   *
   * Lands on DRAFT when MODERATION_ENABLED — the owner then calls `submit` — and on APPROVED
   * otherwise, which is the MVP behaviour that lets an owner publish without waiting for a
   * moderator who does not yet exist.
   */
  async create(user: AuthenticatedUser, input: CreateBusinessInput): Promise<Business> {
    if (!(await this.catalog.typeExists(input.type))) {
      throw new AppException(ERROR_CODE.BUSINESS_TYPE_NOT_FOUND, 422, 'Biznes turi topilmadi', {
        type: 'Biznes turi topilmadi',
      });
    }
    await this.assertPhoneVerified(user.id);
    if ((await this.businesses.countByOwner(user.id)) >= MAX_BUSINESSES_PER_OWNER) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        `Bitta hisobda ${MAX_BUSINESSES_PER_OWNER} tadan ko‘p biznes bo‘lmaydi`,
      );
    }
    return this.businesses.create({
      ownerId: user.id,
      status: this.moderationEnabled() ? BusinessStatus.DRAFT : BusinessStatus.APPROVED,
      type: input.type,
      name: input.name,
      phone: input.phone,
      legalName: input.legalName,
      inn: input.inn,
      description: input.description,
      logoUrl: input.logoUrl,
      coverUrl: input.coverUrl,
      contacts: input.contacts,
      isOnlineOnly: input.isOnlineOnly,
    });
  }

  /** The caller's non-archived businesses. */
  async getMyBusinesses(user: AuthenticatedUser): Promise<Business[]> {
    return this.businesses.findManyByOwner(user.id);
  }

  /** A single business the caller owns. */
  async getById(user: AuthenticatedUser, id: string): Promise<Business> {
    return this.loadOwned(user, id);
  }

  /**
   * Updates a business the caller owns. `type` is immutable — a body that tries to change it is
   * rejected with 422 BUSINESS_TYPE_IMMUTABLE.
   */
  async update(user: AuthenticatedUser, id: string, input: UpdateBusinessInput): Promise<Business> {
    const current = await this.loadOwned(user, id);
    return this.applyUpdate(current, input);
  }

  /**
   * Admin edit of ANY business (Faza 3): the exact same validation + mutation as {@link update} but
   * the ownership check is skipped. Existence and soft-delete rules still apply (404
   * BUSINESS_NOT_FOUND); `type` stays immutable (422 BUSINESS_TYPE_IMMUTABLE).
   */
  async adminUpdate(id: string, input: UpdateBusinessInput): Promise<Business> {
    const current = await this.loadById(id);
    return this.applyUpdate(current, input);
  }

  /**
   * Shared update core for the owner ({@link update}) and admin ({@link adminUpdate}) paths: rejects
   * an attempt to change the immutable `type` (422 BUSINESS_TYPE_IMMUTABLE), then persists the patch.
   */
  private applyUpdate(current: Business, input: UpdateBusinessInput): Promise<Business> {
    if (input.type !== undefined && input.type !== current.type) {
      throw new AppException(
        ERROR_CODE.BUSINESS_TYPE_IMMUTABLE,
        422,
        "Biznes turini o'zgartirib bo'lmaydi",
        { type: "Biznes turini o'zgartirib bo'lmaydi" },
      );
    }
    return this.businesses.update(current.id, {
      name: input.name,
      phone: input.phone,
      legalName: input.legalName,
      inn: input.inn,
      description: input.description,
      logoUrl: input.logoUrl,
      coverUrl: input.coverUrl,
      contacts: input.contacts,
      isOnlineOnly: input.isOnlineOnly,
    });
  }

  /**
   * Submits a business for review (§5.2). DRAFT | REJECTED → PENDING_REVIEW, clearing any previous
   * `rejectionReason` so a resubmission does not keep showing the old verdict.
   *
   * With moderation off there is no queue to enter, so it lands on APPROVED directly — otherwise
   * this endpoint would be a dead end leaving the business permanently unable to publish.
   */
  async submit(user: AuthenticatedUser, id: string): Promise<Business> {
    const current = await this.loadOwned(user, id);
    if (current.status !== BusinessStatus.DRAFT && current.status !== BusinessStatus.REJECTED) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Bu biznesni ko‘rib chiqishga yuborish mumkin emas',
      );
    }
    const target = this.moderationEnabled()
      ? BusinessStatus.PENDING_REVIEW
      : BusinessStatus.APPROVED;
    return this.businesses.setStatus(current.id, target, null);
  }

  /**
   * Admin: approves a business under review (§6.2). PENDING_REVIEW → APPROVED, clearing the stored
   * verdict — an approval that left a stale `rejectionReason` behind would keep showing the old
   * rejection on a business that is now live.
   *
   * A moderation decision, deliberately separate from {@link adminUpdate}: a moderator approving
   * must not be able to rewrite the record in the same breath.
   */
  async adminApprove(id: string): Promise<Business> {
    const current = await this.loadUnderReview(id);
    return this.businesses.setStatus(current.id, BusinessStatus.APPROVED, null);
  }

  /** Admin: rejects a business under review (§6.2), recording the verdict the owner will see. */
  async adminReject(id: string, reason: string): Promise<Business> {
    const current = await this.loadUnderReview(id);
    return this.businesses.setStatus(current.id, BusinessStatus.REJECTED, reason);
  }

  /** Soft-deletes a business the caller owns (ARCHIVED) and cascades its listings to ARCHIVED. */
  async archive(user: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.loadOwned(user, id);
    await this.businesses.archive(current.id);
  }

  /** Loads a business, enforcing existence (404), soft-delete (404) and ownership (403). */
  private async loadOwned(user: AuthenticatedUser, id: string): Promise<Business> {
    const business = await this.loadById(id);
    if (business.ownerId !== user.id) {
      throw AppException.forbidden();
    }
    return business;
  }

  /** Loads a business enforcing existence + soft-delete (404). No ownership check (admin path). */
  private async loadById(id: string): Promise<Business> {
    const business = await this.businesses.findById(id);
    if (business === null || business.status === BusinessStatus.ARCHIVED) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    return business;
  }

  /** Loads a business that is awaiting a moderator: 404 unknown/archived, 409 any other status. */
  private async loadUnderReview(id: string): Promise<Business> {
    const business = await this.loadById(id);
    if (business.status !== BusinessStatus.PENDING_REVIEW) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Bu biznes ko‘rib chiqilmoqda emas',
      );
    }
    return business;
  }

  /** The moderation queue's master switch (DISCOUNTS_BUSINESS_API §6.2). */
  private moderationEnabled(): boolean {
    return this.config.get('MODERATION_ENABLED', { infer: true }) === 'true';
  }

  private async assertPhoneVerified(ownerId: string): Promise<void> {
    const verified = await this.owners.findPhoneVerified(ownerId);
    if (verified !== true) {
      throw new AppException(ERROR_CODE.PHONE_NOT_VERIFIED, 403, 'Avval telefoningizni tasdiqlang');
    }
  }
}
