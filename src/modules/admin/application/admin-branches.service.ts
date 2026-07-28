import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  ADMIN_BRANCH_READ_REPOSITORY,
  AdminBranchListFilter,
  AdminBranchPage,
  AdminBranchReadRepository,
} from '../domain/admin-branch-read.repository';
import { AdminBranch } from '../domain/entities/admin-branch.entity';

/**
 * Admin cross-business branch reads (Faza 1). Unscoped — the admin sees every branch across
 * businesses, bypassing the owner-scoping the mobile branch endpoints have. Read-only; depends on
 * the repository interface only.
 */
@Injectable()
export class AdminBranchesService {
  constructor(
    @Inject(ADMIN_BRANCH_READ_REPOSITORY)
    private readonly branches: AdminBranchReadRepository,
  ) {}

  /** The filtered, paginated list of every branch. */
  list(filter: AdminBranchListFilter): Promise<AdminBranchPage> {
    return this.branches.list(filter);
  }

  /** The full branch record; 404 `BRANCH_NOT_FOUND` when the id is unknown. */
  async getById(id: string): Promise<AdminBranch> {
    const branch = await this.branches.findById(id);
    if (branch === null) {
      throw AppException.notFound(ERROR_CODE.BRANCH_NOT_FOUND, 'Filial topilmadi');
    }
    return branch;
  }
}
