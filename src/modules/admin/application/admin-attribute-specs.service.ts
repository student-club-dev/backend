import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  ADMIN_CATALOG_WRITE_REPOSITORY,
  AdminCatalogWriteRepository,
  AttributeSpecUpdate,
  AttributeSpecWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminAttributeSpec } from '../domain/entities/admin-attribute-spec.entity';

/**
 * Admin CRUD for the catalog attribute specs (the dynamic listing-form fields). Enforces
 * business-type existence (404) and identity-uniqueness (409 on `[businessType, categoryKey, key]`)
 * and existence (404); both AdminJwtGuard + AdminRoleGuard (ADMIN) authorise the caller. Deleting a
 * spec has NO in-use guard — a listing's attributes are loose JSON with no reliable FK back to it.
 */
@Injectable()
export class AdminAttributeSpecsService {
  constructor(
    @Inject(ADMIN_CATALOG_WRITE_REPOSITORY)
    private readonly catalog: AdminCatalogWriteRepository,
  ) {}

  /**
   * Creates an attribute spec. The `businessType` must exist (404 BUSINESS_TYPE_NOT_FOUND) and the
   * `[businessType, categoryKey, key]` identity must be free (409 ATTRIBUTE_SPEC_EXISTS).
   */
  async create(data: AttributeSpecWrite): Promise<AdminAttributeSpec> {
    if (!(await this.catalog.businessTypeExists(data.businessType))) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_TYPE_NOT_FOUND, 'Biznes turi topilmadi');
    }
    if (
      (await this.catalog.findAttributeSpecByUnique(
        data.businessType,
        data.categoryKey,
        data.key,
      )) !== null
    ) {
      throw AppException.conflict(ERROR_CODE.ATTRIBUTE_SPEC_EXISTS, 'Bu atribut allaqachon mavjud');
    }
    return this.catalog.createAttributeSpec(data);
  }

  /** Updates an existing attribute spec (404 ATTRIBUTE_SPEC_NOT_FOUND if it does not exist). */
  async update(id: string, data: AttributeSpecUpdate): Promise<AdminAttributeSpec> {
    await this.assertExists(id);
    return this.catalog.updateAttributeSpec(id, data);
  }

  /** Deletes an attribute spec (404 ATTRIBUTE_SPEC_NOT_FOUND). No in-use guard (loose JSON). */
  async delete(id: string): Promise<void> {
    await this.assertExists(id);
    await this.catalog.deleteAttributeSpec(id);
  }

  private async assertExists(id: string): Promise<void> {
    if ((await this.catalog.findAttributeSpecById(id)) === null) {
      throw AppException.notFound(ERROR_CODE.ATTRIBUTE_SPEC_NOT_FOUND, 'Atribut topilmadi');
    }
  }
}
