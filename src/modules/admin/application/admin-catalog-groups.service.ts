import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import {
  ADMIN_CATALOG_WRITE_REPOSITORY,
  AdminCatalogWriteRepository,
  CatalogGroupWrite,
} from '../domain/admin-catalog-write.repository';

/**
 * Admin CRUD for the catalog groups (the home-screen groupings over business types). Enforces
 * key-uniqueness (409), existence (404) and referential-integrity (409) rules; both AdminJwtGuard +
 * AdminRoleGuard (ADMIN) authorise the caller. Depends on the admin catalog write port only.
 */
@Injectable()
export class AdminCatalogGroupsService {
  constructor(
    @Inject(ADMIN_CATALOG_WRITE_REPOSITORY)
    private readonly catalog: AdminCatalogWriteRepository,
  ) {}

  /** Creates a group. The `key` must be free (else 409 CATALOG_GROUP_EXISTS). */
  async create(key: string, data: CatalogGroupWrite): Promise<CatalogGroup> {
    if ((await this.catalog.findGroupByKey(key)) !== null) {
      throw AppException.conflict(
        ERROR_CODE.CATALOG_GROUP_EXISTS,
        'Bu katalog guruhi allaqachon mavjud',
      );
    }
    return this.catalog.createGroup(key, data);
  }

  /** Updates an existing group (404 CATALOG_GROUP_NOT_FOUND if it does not exist). */
  async update(key: string, data: Partial<CatalogGroupWrite>): Promise<CatalogGroup> {
    await this.assertExists(key);
    return this.catalog.updateGroup(key, data);
  }

  /** Deletes a group — only when no business type references it (else 409 CATALOG_GROUP_IN_USE). */
  async delete(key: string): Promise<void> {
    await this.assertExists(key);
    if ((await this.catalog.countBusinessTypesInGroup(key)) > 0) {
      throw AppException.conflict(
        ERROR_CODE.CATALOG_GROUP_IN_USE,
        'Bu katalog guruhi ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.catalog.deleteGroup(key);
  }

  private async assertExists(key: string): Promise<void> {
    if ((await this.catalog.findGroupByKey(key)) === null) {
      throw AppException.notFound(ERROR_CODE.CATALOG_GROUP_NOT_FOUND, 'Katalog guruhi topilmadi');
    }
  }
}
