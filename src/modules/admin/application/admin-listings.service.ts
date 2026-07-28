import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { ListingStatsResult } from '../../listings/application/listings.io';
import {
  ADMIN_LISTING_READ_REPOSITORY,
  AdminListingListFilter,
  AdminListingPage,
  AdminListingReadRepository,
} from '../domain/admin-listing-read.repository';
import { AdminListing } from '../domain/entities/admin-listing.entity';

/**
 * Admin cross-business listing reads (Faza 1). Unscoped — the admin sees every listing regardless of
 * owner or status (DRAFT / PENDING_REVIEW / REJECTED / ARCHIVED included), bypassing the ownership
 * gate the owner-side listing endpoints have. Read-only; depends on the repository interface only.
 */
@Injectable()
export class AdminListingsService {
  constructor(
    @Inject(ADMIN_LISTING_READ_REPOSITORY)
    private readonly listings: AdminListingReadRepository,
  ) {}

  /** The filtered, paginated list of every listing. */
  list(filter: AdminListingListFilter): Promise<AdminListingPage> {
    return this.listings.list(filter);
  }

  /** The full listing record; 404 `LISTING_NOT_FOUND` when the id is unknown. */
  async getById(id: string): Promise<AdminListing> {
    const listing = await this.listings.findById(id);
    if (listing === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    return listing;
  }

  /**
   * Analytics for any listing (no ownership check), computed exactly like the owner stats: the
   * repository aggregates views, favourites, confirmed redemptions and their revenue; the derived
   * `conversionRate` (`redemptionsCount / viewsCount`, 0 when there are no views) is added here.
   * 404 `LISTING_NOT_FOUND` when the id is unknown.
   */
  async stats(id: string): Promise<ListingStatsResult> {
    const stats = await this.listings.stats(id);
    if (stats === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    return {
      listingId: id,
      viewsCount: stats.viewsCount,
      favoritesCount: stats.favoritesCount,
      redemptionsCount: stats.redemptionsCount,
      conversionRate: stats.viewsCount === 0 ? 0 : stats.redemptionsCount / stats.viewsCount,
      totalRevenue: stats.totalRevenue,
    };
  }
}
