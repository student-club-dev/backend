import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  MAX_ACTIVE_LISTINGS_PER_BUSINESS,
  MAX_DAILY_SUBMITS,
  assertMaySubmit,
  type SubmitLimitDeps,
} from './submit-limits';

const NOW = new Date('2026-08-03T12:00:00Z');

function deps(active: number, submittedToday: number): SubmitLimitDeps {
  return {
    countActiveByBusiness: jest.fn().mockResolvedValue(active),
    countSubmittedByOwnerSince: jest.fn().mockResolvedValue(submittedToday),
  };
}

describe('assertMaySubmit', () => {
  it('passes below both caps', async () => {
    await expect(assertMaySubmit(deps(99, 49), 'biz-1', 'owner-1', NOW)).resolves.toBeUndefined();
  });

  it('rejects at the active-listing cap', async () => {
    await expect(
      assertMaySubmit(deps(MAX_ACTIVE_LISTINGS_PER_BUSINESS, 0), 'biz-1', 'owner-1', NOW),
    ).rejects.toMatchObject({ code: ERROR_CODE.LISTING_LIMIT_REACHED, status: 429 });
  });

  it('rejects at the daily submit cap', async () => {
    await expect(
      assertMaySubmit(deps(0, MAX_DAILY_SUBMITS), 'biz-1', 'owner-1', NOW),
    ).rejects.toMatchObject({ code: ERROR_CODE.RATE_LIMITED, status: 429 });
  });

  it('checks the cheaper count first — a capped business never pays for the day probe', async () => {
    const d = deps(MAX_ACTIVE_LISTINGS_PER_BUSINESS, 0);

    await expect(assertMaySubmit(d, 'biz-1', 'owner-1', NOW)).rejects.toBeDefined();

    expect(d.countSubmittedByOwnerSince).not.toHaveBeenCalled();
  });

  it('measures the daily window as the 24 hours before `now`', async () => {
    const d = deps(0, 0);

    await assertMaySubmit(d, 'biz-1', 'owner-1', NOW);

    expect(d.countSubmittedByOwnerSince).toHaveBeenCalledWith(
      'owner-1',
      new Date('2026-08-02T12:00:00Z'),
    );
  });

  it('scopes the active count to the business and the day count to the owner', async () => {
    const d = deps(0, 0);

    await assertMaySubmit(d, 'biz-1', 'owner-1', NOW);

    // The caps differ in scope on purpose: a business may hold 100 live offers, but one owner may
    // not submit more than 50 a day across every business they own.
    expect(d.countActiveByBusiness).toHaveBeenCalledWith('biz-1');
    expect(d.countSubmittedByOwnerSince).toHaveBeenCalledWith('owner-1', expect.any(Date));
  });
});
