import { Injectable } from '@nestjs/common';
import { UpdateListingInput } from '../../listings/application/listings.io';
import { ListingsService } from '../../listings/application/listings.service';
import { AdminListing } from '../domain/entities/admin-listing.entity';
import { AdminListingsService } from './admin-listings.service';

/**
 * Admin listing writes (Faza 3). Edit reuses {@link ListingsService.adminUpdate} — the same
 * re-validation + finalPrice recompute + catalog / attribute / discount checks as the owner's own
 * update ({@link ListingsService.update}) but with the ownership check skipped — then re-fetches
 * through {@link AdminListingsService} to return the Faza 1 admin detail shape.
 */
@Injectable()
export class AdminListingsWriteService {
  constructor(
    private readonly reads: AdminListingsService,
    private readonly listings: ListingsService,
  ) {}

  /** Full-replace edit of the listing identified by `id`. 404 `LISTING_NOT_FOUND` when the id is unknown. */
  async update(id: string, input: UpdateListingInput): Promise<AdminListing> {
    await this.listings.adminUpdate(id, input);
    return this.reads.getById(id);
  }

  /**
   * Approves a listing awaiting review (§6.2) — ACTIVE, or SCHEDULED when `validFrom` is still in
   * the future. 404 `LISTING_NOT_FOUND` for an unknown or archived id; 409
   * `INVALID_STATUS_TRANSITION` when it is not PENDING_REVIEW.
   */
  async approve(id: string): Promise<AdminListing> {
    await this.listings.adminApprove(id);
    return this.reads.getById(id);
  }

  /**
   * Archives a listing (admin-panel 15-deletion.md §5.1) — the moderator's way to take something
   * out of the feed. Soft: `ARCHIVED` is what the owner's own DELETE produces, so the two agree.
   *
   * `MODERATOR` may do this, unlike closing an account: removing one listing is everyday
   * moderation and it is reversible by re-creating, whereas an account closure is not.
   */
  async archive(id: string): Promise<AdminListing> {
    await this.listings.adminArchive(id);
    return this.reads.getById(id);
  }

  /** Rejects a listing awaiting review (§6.2), recording the verdict. Same errors as {@link approve}. */
  async reject(id: string, reason: string): Promise<AdminListing> {
    await this.listings.adminReject(id, reason);
    return this.reads.getById(id);
  }
}
