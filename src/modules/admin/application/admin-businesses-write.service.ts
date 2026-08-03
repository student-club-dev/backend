import { Injectable } from '@nestjs/common';
import { UpdateBusinessInput } from '../../business/application/business.io';
import { BusinessService } from '../../business/application/business.service';
import { AdminBusiness } from '../domain/entities/admin-business.entity';
import { AdminBusinessesService } from './admin-businesses.service';

/**
 * Admin business writes (Faza 3). Edit reuses {@link BusinessService.adminUpdate} — the exact same
 * validation + mutation as the owner's own update ({@link BusinessService.update}: `type` immutable →
 * 422 BUSINESS_TYPE_IMMUTABLE) but with the ownership check skipped — then re-fetches the full record
 * through {@link AdminBusinessesService} to return the Faza 1 admin detail shape.
 */
@Injectable()
export class AdminBusinessesWriteService {
  constructor(
    private readonly reads: AdminBusinessesService,
    private readonly businesses: BusinessService,
  ) {}

  /**
   * Applies the update to the business identified by `id`. 404 `BUSINESS_NOT_FOUND` when the id is
   * unknown or archived; 422 `BUSINESS_TYPE_IMMUTABLE` on an attempt to change `type`.
   */
  async update(id: string, input: UpdateBusinessInput): Promise<AdminBusiness> {
    await this.businesses.adminUpdate(id, input);
    return this.reads.getById(id);
  }

  /**
   * Approves a business awaiting review (§6.2). 404 `BUSINESS_NOT_FOUND` when the id is unknown or
   * archived; 409 `INVALID_STATUS_TRANSITION` when it is not PENDING_REVIEW.
   */
  async approve(id: string): Promise<AdminBusiness> {
    await this.businesses.adminApprove(id);
    return this.reads.getById(id);
  }

  /** Rejects a business awaiting review (§6.2), recording the verdict. Same errors as {@link approve}. */
  async reject(id: string, reason: string): Promise<AdminBusiness> {
    await this.businesses.adminReject(id, reason);
    return this.reads.getById(id);
  }
}
