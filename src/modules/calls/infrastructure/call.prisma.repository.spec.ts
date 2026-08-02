import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallPrismaRepository } from './call.prisma.repository';

// Scoped to `hasCompletedCallBetween` only — this is a targeted regression test for the task-13
// fix-round finding (a never-answered ENDED call must not count), not a full repository suite;
// the rest of this repository is exercised by the e2e suite (see plan Task 20).
describe('CallPrismaRepository.hasCompletedCallBetween', () => {
  it('requires answeredAt to be non-null, not ENDED status alone', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { call: { findFirst } } as unknown as PrismaService;
    const repo = new CallPrismaRepository(prisma);

    await repo.hasCompletedCallBetween('A', 'B');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: CallStatus.ENDED,
          answeredAt: { not: null },
        }),
      }),
    );
  });
});
