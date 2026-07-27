import { ListingsService } from '../modules/listings/application/listings.service';
import { StatusTransitionCounts } from '../modules/listings/domain/listing.repository';
import { ListingStatusCron } from './listing-status.cron';

function makeService(
  runStatusTransitions: jest.Mock = jest
    .fn()
    .mockResolvedValue({ expired: 0, activated: 0, soldOut: 0 } as StatusTransitionCounts),
): ListingsService {
  return { runStatusTransitions } as unknown as ListingsService;
}

describe('ListingStatusCron', () => {
  it('runs the sweep every tick', async () => {
    const run = jest.fn().mockResolvedValue({ expired: 2, activated: 1, soldOut: 0 });
    await new ListingStatusCron(makeService(run)).sweep();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a sweep fails — the next tick retries', async () => {
    const run = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(new ListingStatusCron(makeService(run)).sweep()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
