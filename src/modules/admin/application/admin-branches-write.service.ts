import { Injectable } from '@nestjs/common';
import { BranchInput } from '../../branches/application/branches.io';
import { BranchesService } from '../../branches/application/branches.service';
import { AdminBranch } from '../domain/entities/admin-branch.entity';
import { AdminBranchesService } from './admin-branches.service';

/**
 * Admin branch writes (Faza 3). Edit reuses {@link BranchesService.adminUpdate} — the same
 * full-replace + location / trade-center validation gates as the owner's own update
 * ({@link BranchesService.update}) but with the owning-business ownership check skipped — then
 * re-fetches through {@link AdminBranchesService} to return the Faza 1 admin detail shape.
 */
@Injectable()
export class AdminBranchesWriteService {
  constructor(
    private readonly reads: AdminBranchesService,
    private readonly branches: BranchesService,
  ) {}

  /** Full-replace edit of the branch identified by `id`. 404 `BRANCH_NOT_FOUND` when the id is unknown. */
  async update(id: string, input: BranchInput): Promise<AdminBranch> {
    await this.branches.adminUpdate(id, input);
    return this.reads.getById(id);
  }
}
