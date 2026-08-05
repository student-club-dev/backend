import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { directKeyFor } from '../../common/chat/direct-key';
import { PrismaService } from '../database/prisma.service';
import { ConversationDirectoryRepository } from './conversation-directory.repository';

const UNIQUE_VIOLATION = 'P2002';

/**
 * Resolves a pair to their 1:1 conversation without importing chat — that direction is taken (chat
 * subscribes to `CallEndedBus`), which is why `directKeyFor` lives in `common/`. Shared
 * infrastructure: calls needs it to place one, connections to name the chat a new pair may now use.
 *
 * ⚠️ The `create` block must stay identical to `ChatPrismaRepository.createDirect`: both write rows
 * the other one then reads. `type` is the schema default (`DIRECT`) and is spelled out here only to
 * make that explicit; `nextSeq` and the rest are defaults in both.
 */
@Injectable()
export class ConversationDirectoryPrismaRepository implements ConversationDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateDirect(a: string, b: string): Promise<string> {
    const directKey = directKeyFor(a, b);
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
      select: { id: true },
    });
    if (existing !== null) {
      return existing.id;
    }
    try {
      const created = await this.prisma.conversation.create({
        data: {
          directKey,
          type: 'DIRECT',
          members: { create: [{ studentId: a }, { studentId: b }] },
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      // ⚠️ Glare is a designed-for case here: this runs on EVERY invite, so two students dialling
      // each other in the same second both find nothing and both insert. One loses the
      // `conversations.direct_key` unique index and would otherwise get an error ack before `claim`
      // ever ran — on the pair's very first interaction. The winner's row is the answer.
      // `upsert` is not the fix: the nested `members.create` makes Prisma fall back to the same
      // find-then-create underneath.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        const won = await this.prisma.conversation.findUnique({
          where: { directKey },
          select: { id: true },
        });
        if (won !== null) {
          return won.id;
        }
      }
      throw error;
    }
  }
}
