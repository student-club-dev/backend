import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import {
  BUSINESS_OWNER_REPOSITORY,
  BusinessOwnerRepository,
} from '../domain/business-owner.repository';
import { BUSINESS_REPOSITORY, BusinessRepository } from '../domain/business.repository';
import { Business } from '../domain/entities/business.entity';
import { BusinessStatus } from '../domain/enums/business-status.enum';
import { CreateBusinessInput, UpdateBusinessInput } from './business.io';

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
  ) {}

  /**
   * Creates a DRAFT business owned by the caller. Rejects an unknown `type` (422) and — per the
   * D1 phone-verification gate — an owner whose phone is not verified (403).
   */
  async create(user: AuthenticatedUser, input: CreateBusinessInput): Promise<Business> {
    if (!(await this.catalog.typeExists(input.type))) {
      throw new AppException(ERROR_CODE.BUSINESS_TYPE_NOT_FOUND, 422, 'Biznes turi topilmadi', {
        type: 'Biznes turi topilmadi',
      });
    }
    await this.assertPhoneVerified(user.id);
    return this.businesses.create({
      ownerId: user.id,
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

  /** Soft-deletes a business the caller owns (ARCHIVED) and cascades its listings to ARCHIVED. */
  async archive(user: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.loadOwned(user, id);
    await this.businesses.archive(current.id);
  }

  /** Loads a business, enforcing existence (404), soft-delete (404) and ownership (403). */
  private async loadOwned(user: AuthenticatedUser, id: string): Promise<Business> {
    const business = await this.businesses.findById(id);
    if (business === null || business.status === BusinessStatus.ARCHIVED) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (business.ownerId !== user.id) {
      throw AppException.forbidden();
    }
    return business;
  }

  private async assertPhoneVerified(ownerId: string): Promise<void> {
    const verified = await this.owners.findPhoneVerified(ownerId);
    if (verified !== true) {
      throw new AppException(ERROR_CODE.PHONE_NOT_VERIFIED, 403, 'Avval telefoningizni tasdiqlang');
    }
  }
}
