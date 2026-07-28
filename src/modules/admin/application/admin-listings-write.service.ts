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
}
