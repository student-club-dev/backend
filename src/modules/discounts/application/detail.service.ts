import { Inject, Injectable } from '@nestjs/common';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { GeoScope } from '../../../common/geo/geo-scope';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { DETAIL_REPOSITORY, DetailRepository } from '../domain/detail.repository';
import {
  DetailRedemption,
  ListingDetail,
  redemptionWindowStart,
} from '../domain/listing-detail.model';

/**
 * One listing, asked for by id in the body (Q2). `viewer` is null for an anonymous request — the
 * feed is open, and signing in only adds personalisation.
 */
export interface ListingDetailQuery {
  listingId: string;
  geo: GeoScope | null;
  viewer: AuthenticatedUser | null;
}

/**
 * The detail screen (STUDENT_FEED.md §9). Three rules live here rather than in the query:
 * an invisible listing is a 404 that never says why (Q4), the promo code and the personal
 * redemption budget belong to signed-in students only (D5), and a view is counted for a student,
 * never for an anonymous request.
 */
@Injectable()
export class DetailService {
  constructor(@Inject(DETAIL_REPOSITORY) private readonly repository: DetailRepository) {}

  async getDetail(query: ListingDetailQuery): Promise<ListingDetail> {
    const now = new Date();
    const studentId = toStudentId(query.viewer);

    const detail = await this.repository.findVisibleById({
      listingId: query.listingId,
      geo: query.geo,
      studentId,
      now,
    });
    if (detail === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }

    const redemption = await this.resolveRedemption(detail, studentId, now);

    // Anonymous views are not counted at all. The only identity available without a token is the
    // IP, and carrier NAT makes it both too coarse (a whole city behind one address) and too
    // volatile (a new address per reconnect) to deduplicate against — a counter built on it would
    // be wrong in both directions, so the honest number is the one we can attribute.
    if (studentId !== null) {
      await this.repository.registerView(detail.id, studentId);
    }

    return { ...detail, redemption };
  }

  /**
   * The redemption block as this viewer may see it. The promo code IS the discount, so an anonymous
   * caller gets `null` — otherwise the code could be scraped without ever creating an account.
   */
  private async resolveRedemption(
    detail: ListingDetail,
    studentId: string | null,
    now: Date,
  ): Promise<DetailRedemption> {
    if (studentId === null) {
      return { ...detail.redemption, promoCode: null, remainingForUser: null };
    }
    return {
      ...detail.redemption,
      remainingForUser: await this.remainingForUser(detail, studentId, now),
    };
  }

  /**
   * How many more times this student may redeem the offer, or `null` when the listing sets no
   * per-user limit — "unlimited" is not a number, and 0 would read as "used up".
   */
  private async remainingForUser(
    detail: ListingDetail,
    studentId: string,
    now: Date,
  ): Promise<number | null> {
    const { perUserLimit, perUserPeriod } = detail.redemption;
    if (perUserLimit === null) {
      return null;
    }
    const since = redemptionWindowStart(perUserPeriod, now);
    const used = await this.repository.countRedemptions(detail.id, studentId, since);
    // Clamped: a limit lowered after the fact must not report a negative budget.
    return Math.max(0, perUserLimit - used);
  }
}

/**
 * The viewer as the feed sees them. A business-owner token is a valid identity for the wrong app —
 * it personalises nothing here, so it is treated exactly like an anonymous request.
 */
function toStudentId(viewer: AuthenticatedUser | null): string | null {
  return viewer !== null && viewer.type === AccountType.STUDENT ? viewer.id : null;
}
