import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ConversationDirectoryPrismaRepository } from './conversation-directory.prisma.repository';

const A = 'std_a';
const B = 'std_b';
const DIRECT_KEY = [A, B].sort().join(':');

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.20.0',
    meta: { target: ['direct_key'] },
  });

const repository = (
  findUnique: jest.Mock,
  create: jest.Mock,
): ConversationDirectoryPrismaRepository =>
  new ConversationDirectoryPrismaRepository({
    conversation: { findUnique, create },
  } as unknown as PrismaService);

describe('ConversationDirectoryPrismaRepository.findOrCreateDirect', () => {
  it('reuses the pair’s existing conversation', async () => {
    const create = jest.fn();
    const id = await repository(
      jest.fn().mockResolvedValue({ id: 'cnv_1' }),
      create,
    ).findOrCreateDirect(A, B);

    expect(id).toBe('cnv_1');
    expect(create).not.toHaveBeenCalled();
  });

  // The key is order-independent, so (A,B) and (B,A) must resolve to the same conversation.
  it('looks the pair up by their sorted direct key', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'cnv_1' });
    await repository(findUnique, jest.fn()).findOrCreateDirect(B, A);

    expect(findUnique).toHaveBeenCalledWith({
      where: { directKey: DIRECT_KEY },
      select: { id: true },
    });
  });

  it('creates one with both members on first contact', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'cnv_new' });
    const id = await repository(jest.fn().mockResolvedValue(null), create).findOrCreateDirect(A, B);

    expect(id).toBe('cnv_new');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          directKey: DIRECT_KEY,
          members: { create: [{ studentId: A }, { studentId: B }] },
        }),
      }),
    );
  });

  /**
   * ⚠️ This runs on EVERY invite, and glare — two students dialling each other in the same second —
   * is a designed-for scenario. On a pair's first ever interaction both sides find nothing and both
   * insert; the loser of the `direct_key` unique index must resolve to the winner's row, not fail
   * the invite with an error ack before `claim` has even run.
   */
  it('resolves to the winner when a concurrent invite created it first', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null) // our read: not there yet
      .mockResolvedValueOnce({ id: 'cnv_winner' }); // re-read after losing the race
    const create = jest.fn().mockRejectedValue(uniqueViolation());

    expect(await repository(findUnique, create).findOrCreateDirect(A, B)).toBe('cnv_winner');
  });

  // A P2002 with nothing to re-read is not the race — do not swallow it into a wrong answer.
  it('rethrows a unique violation it cannot resolve', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue(uniqueViolation());

    await expect(repository(findUnique, create).findOrCreateDirect(A, B)).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rethrows any other failure untouched', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(repository(findUnique, create).findOrCreateDirect(A, B)).rejects.toThrow(
      'db down',
    );
  });
});
