import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import type { StudentListingRepository } from '../domain/student-listing.repository';
import { assertMayPublish, type PublishCandidate } from './anti-spam';

const NOW = new Date('2026-08-03T12:00:00Z');

const candidate: PublishCandidate = {
  id: 'lst_1',
  ownerId: 'usr_1',
  kind: StudentListingKind.RENTAL,
  title: 'Chilonzorda sherik kerak',
  price: 1_500_000,
};

function repository(overrides: Partial<StudentListingRepository> = {}): StudentListingRepository {
  return {
    countActiveByOwner: jest.fn().mockResolvedValue(0),
    countPublishedSince: jest.fn().mockResolvedValue(0),
    existsDuplicate: jest.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as StudentListingRepository;
}

describe('assertMayPublish (§6)', () => {
  it('passes when every limit is clear', async () => {
    await expect(assertMayPublish(repository(), candidate, NOW)).resolves.toBeUndefined();
  });

  it('rejects a 21st active listing', async () => {
    const call = assertMayPublish(
      repository({ countActiveByOwner: jest.fn().mockResolvedValue(20) }),
      candidate,
      NOW,
    );
    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_LIMIT_REACHED,
      status: 429,
    });
  });

  it('allows a 20th active listing', async () => {
    const call = assertMayPublish(
      repository({ countActiveByOwner: jest.fn().mockResolvedValue(19) }),
      candidate,
      NOW,
    );
    await expect(call).resolves.toBeUndefined();
  });

  it('rejects an 11th publish in a day', async () => {
    const call = assertMayPublish(
      repository({ countPublishedSince: jest.fn().mockResolvedValue(10) }),
      candidate,
      NOW,
    );
    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_LIMIT_REACHED,
      status: 429,
    });
  });

  it('counts the daily publish window from 24h before now', async () => {
    const countPublishedSince = jest.fn().mockResolvedValue(0);
    await assertMayPublish(repository({ countPublishedSince }), candidate, NOW);
    expect(countPublishedSince).toHaveBeenCalledWith('usr_1', new Date('2026-08-02T12:00:00Z'));
  });

  it('rejects a duplicate inside the 24h window', async () => {
    const call = assertMayPublish(
      repository({ existsDuplicate: jest.fn().mockResolvedValue(true) }),
      candidate,
      NOW,
    );
    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_DUPLICATE,
      status: 409,
    });
  });

  it('probes duplicates on kind, title and price from 24h before now', async () => {
    const existsDuplicate = jest.fn().mockResolvedValue(false);
    await assertMayPublish(repository({ existsDuplicate }), candidate, NOW);
    expect(existsDuplicate).toHaveBeenCalledWith({
      ownerId: 'usr_1',
      kind: StudentListingKind.RENTAL,
      title: 'Chilonzorda sherik kerak',
      price: 1_500_000,
      since: new Date('2026-08-02T12:00:00Z'),
      excludeId: 'lst_1',
    });
  });

  it('excludes an existing listing from its own duplicate probe', async () => {
    // Publishing a saved DRAFT compares it against itself — same owner, kind, title and price —
    // so without this exclusion every submit would fail as a duplicate of itself.
    const existsDuplicate = jest.fn().mockResolvedValue(false);
    await assertMayPublish(repository({ existsDuplicate }), candidate, NOW);
    expect(existsDuplicate).toHaveBeenCalledWith(expect.objectContaining({ excludeId: 'lst_1' }));
  });

  it('passes a null exclusion for a listing that does not exist yet', async () => {
    const existsDuplicate = jest.fn().mockResolvedValue(false);
    await assertMayPublish(repository({ existsDuplicate }), { ...candidate, id: '' }, NOW);
    expect(existsDuplicate).toHaveBeenCalledWith(expect.objectContaining({ excludeId: null }));
  });

  it('throws AppException, never a bare Error', async () => {
    const call = assertMayPublish(
      repository({ existsDuplicate: jest.fn().mockResolvedValue(true) }),
      candidate,
      NOW,
    );
    await expect(call).rejects.toBeInstanceOf(AppException);
  });

  it('checks the cheapest limit first and stops there', async () => {
    // No point probing for duplicates once the account is already at its cap.
    const existsDuplicate = jest.fn().mockResolvedValue(false);
    const call = assertMayPublish(
      repository({ countActiveByOwner: jest.fn().mockResolvedValue(20), existsDuplicate }),
      candidate,
      NOW,
    );
    await expect(call).rejects.toBeInstanceOf(AppException);
    expect(existsDuplicate).not.toHaveBeenCalled();
  });
});
