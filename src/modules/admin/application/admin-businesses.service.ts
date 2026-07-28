import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  ADMIN_BUSINESS_READ_REPOSITORY,
  AdminBusinessListFilter,
  AdminBusinessPage,
  AdminBusinessReadRepository,
} from '../domain/admin-business-read.repository';
import { AdminBusiness } from '../domain/entities/admin-business.entity';

/**
 * Admin cross-owner business reads (Faza 1). Unscoped — the admin sees every business regardless of
 * owner or status (including ARCHIVED), bypassing the owner-only check the mobile `GET /business/:id`
 * has. Read-only; depends on the repository interface only.
 */
@Injectable()
export class AdminBusinessesService {
  constructor(
    @Inject(ADMIN_BUSINESS_READ_REPOSITORY)
    private readonly businesses: AdminBusinessReadRepository,
  ) {}

  /** The filtered, paginated list of every business. */
  list(filter: AdminBusinessListFilter): Promise<AdminBusinessPage> {
    return this.businesses.list(filter);
  }

  /** The full business record; 404 `BUSINESS_NOT_FOUND` when the id is unknown. */
  async getById(id: string): Promise<AdminBusiness> {
    const business = await this.businesses.findById(id);
    if (business === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    return business;
  }
}
