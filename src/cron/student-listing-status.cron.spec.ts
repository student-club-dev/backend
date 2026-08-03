import { StudentListingStatusCron } from './student-listing-status.cron';

describe('StudentListingStatusCron', () => {
  function repository(overrides: Record<string, unknown> = {}) {
    return {
      applyStatusTransitions: jest.fn().mockResolvedValue({ expired: 0, activated: 0 }),
      ...overrides,
    };
  }

  it('sweeps with the current time', async () => {
    const repo = repository();
    await new StudentListingStatusCron(repo as never).sweep();

    const now = repo.applyStatusTransitions.mock.calls[0][0] as Date;
    expect(Math.abs(Date.now() - now.getTime())).toBeLessThan(5_000);
  });

  it('completes quietly when nothing moved', async () => {
    await expect(
      new StudentListingStatusCron(repository() as never).sweep(),
    ).resolves.toBeUndefined();
  });

  it('does not propagate when the sweep rejects', async () => {
    // The cron package invokes ticks unguarded; an escaping rejection would crash the process.
    const repo = repository({
      applyStatusTransitions: jest.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(new StudentListingStatusCron(repo as never).sweep()).resolves.toBeUndefined();
  });
});
