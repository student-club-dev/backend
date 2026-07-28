import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  ADMIN_BUSINESS_OWNER_READ_REPOSITORY,
  AdminBusinessOwnerPage,
  AdminBusinessOwnerReadRepository,
  AdminOwnerListFilter,
} from '../domain/admin-business-owner-read.repository';
import {
  AdminBusinessOwner,
  AdminOwnerBusinessSummary,
} from '../domain/entities/admin-business-owner.entity';

/**
 * Admin cross-user business-owner reads (Faza 1). Unscoped — the admin sees every owner and their
 * businesses, bypassing owner-scoping. Read-only; depends on the repository interface only.
 */
@Injectable()
export class AdminBusinessOwnersService {
  constructor(
    @Inject(ADMIN_BUSINESS_OWNER_READ_REPOSITORY)
    private readonly owners: AdminBusinessOwnerReadRepository,
  ) {}

  /** The filtered, paginated list of every business owner. */
  list(filter: AdminOwnerListFilter): Promise<AdminBusinessOwnerPage> {
    return this.owners.list(filter);
  }

  /** The full owner record; 404 `BUSINESS_OWNER_NOT_FOUND` when the id is unknown. */
  async getById(id: string): Promise<AdminBusinessOwner> {
    const owner = await this.owners.findById(id);
    if (owner === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_OWNER_NOT_FOUND, 'Biznes egasi topilmadi');
    }
    return owner;
  }

  /** Every business belonging to the owner; 404 `BUSINESS_OWNER_NOT_FOUND` if the owner is unknown. */
  async listBusinesses(id: string): Promise<AdminOwnerBusinessSummary[]> {
    if (!(await this.owners.exists(id))) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_OWNER_NOT_FOUND, 'Biznes egasi topilmadi');
    }
    return this.owners.listBusinesses(id);
  }
}
