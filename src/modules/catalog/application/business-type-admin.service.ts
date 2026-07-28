import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  BusinessTypeWrite,
  CATALOG_REPOSITORY,
  CatalogRepository,
} from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';

/**
 * Admin use-cases for the business-type catalog data (create / update / delete). Enforces the
 * key-uniqueness (409), existence (404) and reference (409) rules; both AdminJwtGuard +
 * AdminRoleGuard (ADMIN) authorise the caller. Depends on the catalog repository interface only.
 */
@Injectable()
export class BusinessTypeAdminService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository) {}

  /** Creates a business type. The `type` key must be free (else 409 BUSINESS_TYPE_EXISTS). */
  async create(type: string, data: BusinessTypeWrite): Promise<BusinessType> {
    if (await this.catalog.typeExists(type)) {
      throw AppException.conflict(
        ERROR_CODE.BUSINESS_TYPE_EXISTS,
        'Bu biznes turi allaqachon mavjud',
      );
    }
    await this.assertGroupExists(data.groupKey);
    return this.catalog.createType(type, data);
  }

  /** Updates an existing business type (404 if it does not exist). */
  async update(type: string, data: Partial<BusinessTypeWrite>): Promise<BusinessType> {
    await this.assertExists(type);
    if (data.groupKey !== undefined) {
      await this.assertGroupExists(data.groupKey);
    }
    return this.catalog.updateType(type, data);
  }

  /** Deletes a business type — only when no business and no category reference it (else 409). */
  async delete(type: string): Promise<void> {
    await this.assertExists(type);
    const [businesses, categories] = await Promise.all([
      this.catalog.countBusinessesOfType(type),
      this.catalog.countCategoriesOfType(type),
    ]);
    if (businesses > 0 || categories > 0) {
      throw AppException.conflict(
        ERROR_CODE.BUSINESS_TYPE_IN_USE,
        'Bu biznes turi ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.catalog.deleteType(type);
  }

  private async assertExists(type: string): Promise<void> {
    if (!(await this.catalog.typeExists(type))) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_TYPE_NOT_FOUND, 'Biznes turi topilmadi');
    }
  }

  /**
   * `business_types.group_key` is a NOT NULL FK — an unknown key would surface as a raw Prisma
   * constraint error (500). Check first so the admin gets a 422 naming the field instead.
   */
  private async assertGroupExists(groupKey: string): Promise<void> {
    if (!(await this.catalog.groupExists(groupKey))) {
      throw AppException.validation({ groupKey: 'Bunday katalog guruhi yo‘q' });
    }
  }
}
