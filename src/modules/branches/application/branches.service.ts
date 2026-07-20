import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BRANCH_REPOSITORY, BranchRepository } from '../domain/branches.repository';
import { Branch } from '../domain/entities/branch.entity';
import {
  OWNING_BUSINESS_REPOSITORY,
  OwningBusinessRepository,
} from '../domain/owning-business.repository';
import { BranchInput } from './branches.io';

/**
 * Branch use-cases, nested under a business. The BUSINESS-account gate lives in
 * BusinessAccountGuard; here we enforce ownership: the owning business must exist (404) and belong
 * to the caller (403). Branches are hard-deleted. Depends on repository interfaces only.
 */
@Injectable()
export class BranchesService {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(OWNING_BUSINESS_REPOSITORY) private readonly businesses: OwningBusinessRepository,
  ) {}

  /** All branches of a business the caller owns. */
  async list(user: AuthenticatedUser, businessId: string): Promise<Branch[]> {
    await this.assertBusinessOwned(user, businessId);
    return this.branches.findManyByBusiness(businessId);
  }

  /** Creates a branch under a business the caller owns. */
  async create(user: AuthenticatedUser, businessId: string, input: BranchInput): Promise<Branch> {
    await this.assertBusinessOwned(user, businessId);
    return this.branches.create({
      businessId,
      name: input.name,
      phone: input.phone,
      location: input.location,
      workingHours: input.workingHours,
      deliveryZone: input.deliveryZone,
      isActive: input.isActive,
    });
  }

  /** Full-replace update of a branch the caller owns. */
  async update(
    user: AuthenticatedUser,
    businessId: string,
    branchId: string,
    input: BranchInput,
  ): Promise<Branch> {
    await this.loadOwnedBranch(user, businessId, branchId);
    return this.branches.update(branchId, {
      name: input.name,
      phone: input.phone,
      location: input.location,
      workingHours: input.workingHours,
      deliveryZone: input.deliveryZone,
      isActive: input.isActive,
    });
  }

  /** Hard-deletes a branch the caller owns. */
  async delete(user: AuthenticatedUser, businessId: string, branchId: string): Promise<void> {
    await this.loadOwnedBranch(user, businessId, branchId);
    await this.branches.delete(branchId);
  }

  /** Enforces that the business exists (404) and the caller owns it (403). */
  private async assertBusinessOwned(user: AuthenticatedUser, businessId: string): Promise<void> {
    const ownerId = await this.businesses.findOwnerId(businessId);
    if (ownerId === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (ownerId !== user.id) {
      throw AppException.forbidden();
    }
  }

  /** Loads a branch after ownership is checked, enforcing existence within the business (404). */
  private async loadOwnedBranch(
    user: AuthenticatedUser,
    businessId: string,
    branchId: string,
  ): Promise<Branch> {
    await this.assertBusinessOwned(user, businessId);
    const branch = await this.branches.findById(branchId);
    if (branch === null || branch.businessId !== businessId) {
      throw AppException.notFound(ERROR_CODE.BRANCH_NOT_FOUND, 'Filial topilmadi');
    }
    return branch;
  }
}
