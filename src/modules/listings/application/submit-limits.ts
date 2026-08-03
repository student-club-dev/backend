import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';

/** DISCOUNTS_BUSINESS_API §6.4 — "Bir biznesdagi faol e'lon: 100 (ACTIVE + PENDING_REVIEW)". */
export const MAX_ACTIVE_LISTINGS_PER_BUSINESS = 100;

/** DISCOUNTS_BUSINESS_API §6.4 — "Kuniga submit: 50". */
export const MAX_DAILY_SUBMITS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The counts these limits read. Deliberately narrower than the listing repository so a caller —
 * and a test — needs only what is actually being checked.
 */
export interface SubmitLimitDeps {
  countActiveByBusiness(businessId: string): Promise<number>;
  countSubmittedByOwnerSince(ownerId: string, since: Date): Promise<number>;
}

/**
 * The §6.4 account-level gates on publishing. Throws on the first breach, returns silently otherwise.
 *
 * The two caps are scoped differently on purpose: a single business may hold 100 live offers, but
 * one owner may not submit more than 50 a day across every business they own — the first is an
 * inventory ceiling, the second is anti-spam.
 *
 * Checks run cheapest-first: a business already at its cap is rejected without paying for the
 * daily-window probe. `now` is injected so the window is deterministic under test.
 */
export async function assertMaySubmit(
  deps: SubmitLimitDeps,
  businessId: string,
  ownerId: string,
  now: Date,
): Promise<void> {
  const activeCount = await deps.countActiveByBusiness(businessId);
  if (activeCount >= MAX_ACTIVE_LISTINGS_PER_BUSINESS) {
    throw new AppException(
      ERROR_CODE.LISTING_LIMIT_REACHED,
      429,
      `Bitta biznesda ${MAX_ACTIVE_LISTINGS_PER_BUSINESS} tadan ko‘p faol e’lon bo‘lmaydi`,
    );
  }

  const submittedToday = await deps.countSubmittedByOwnerSince(
    ownerId,
    new Date(now.getTime() - DAY_MS),
  );
  if (submittedToday >= MAX_DAILY_SUBMITS) {
    throw new AppException(
      ERROR_CODE.RATE_LIMITED,
      429,
      `Kuniga ${MAX_DAILY_SUBMITS} tadan ko‘p e’lon yuborolmaysiz`,
    );
  }
}
