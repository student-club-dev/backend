import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  ADMIN_CATALOG_WRITE_REPOSITORY,
  AdminCatalogWriteRepository,
  CategoryUpdate,
  CategoryWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminCategory } from '../domain/entities/admin-category.entity';

/**
 * Admin CRUD for the catalog categories. Enforces business-type existence (404), identity-uniqueness
 * (409 on `[businessType, gender, key]`), existence (404) and in-use (409) rules; both AdminJwtGuard
 * + AdminRoleGuard (ADMIN) authorise the caller. Depends on the admin catalog write port only.
 */
@Injectable()
export class AdminCategoriesService {
  constructor(
    @Inject(ADMIN_CATALOG_WRITE_REPOSITORY)
    private readonly catalog: AdminCatalogWriteRepository,
  ) {}

  /**
   * Creates a category. The `businessType` must exist (404 BUSINESS_TYPE_NOT_FOUND) and the
   * `[businessType, gender, key]` identity must be free (409 CATEGORY_EXISTS).
   */
  async create(data: CategoryWrite): Promise<AdminCategory> {
    if (!(await this.catalog.businessTypeExists(data.businessType))) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_TYPE_NOT_FOUND, 'Biznes turi topilmadi');
    }
    if (
      (await this.catalog.findCategoryByUnique(data.businessType, data.gender, data.key)) !== null
    ) {
      throw AppException.conflict(ERROR_CODE.CATEGORY_EXISTS, 'Bu kategoriya allaqachon mavjud');
    }
    return this.catalog.createCategory(data);
  }

  /** Updates an existing category (404 CATEGORY_NOT_FOUND if it does not exist). */
  async update(id: string, data: CategoryUpdate): Promise<AdminCategory> {
    await this.assertExists(id);
    return this.catalog.updateCategory(id, data);
  }

  /** Deletes a category — only when no listing references it (else 409 CATEGORY_IN_USE). */
  async delete(id: string): Promise<void> {
    const category = await this.assertExists(id);
    if ((await this.catalog.countListingsUsingCategory(category.businessType, category.key)) > 0) {
      throw AppException.conflict(
        ERROR_CODE.CATEGORY_IN_USE,
        'Bu kategoriya ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.catalog.deleteCategory(id);
  }

  private async assertExists(id: string): Promise<AdminCategory> {
    const category = await this.catalog.findCategoryById(id);
    if (category === null) {
      throw AppException.notFound(ERROR_CODE.CATEGORY_NOT_FOUND, 'Kategoriya topilmadi');
    }
    return category;
  }
}
