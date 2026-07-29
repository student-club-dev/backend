import { Injectable } from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ChatAccessRepository } from '../domain/chat-access.repository';

/** Prisma implementation of the conversation-access port. Prisma is used ONLY here. */
@Injectable()
export class ChatAccessPrismaRepository implements ChatAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isMember(conversationId: string, studentId: string): Promise<boolean> {
    const row = await this.prisma.conversationMember.findUnique({
      where: { conversationId_studentId: { conversationId, studentId } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Membership is not enough. History outlives a disconnect, so a past chat partner is still a
   * member long after the connection was removed or a block went up — and neither of those people
   * should be able to push new bytes onto our disk.
   */
  async canSend(conversationId: string, studentId: string): Promise<boolean> {
    const other = await this.prisma.conversationMember.findFirst({
      where: { conversationId, studentId: { not: studentId } },
      select: { studentId: true },
    });
    if (other === null) {
      // No counterpart: either not a member, or a conversation with nobody to send to.
      return this.isMember(conversationId, studentId);
    }
    if (!(await this.isMember(conversationId, studentId))) {
      return false;
    }

    const [connection, block] = await Promise.all([
      this.prisma.connection.findFirst({
        where: {
          status: ConnectionStatus.ACCEPTED,
          OR: [
            { requesterId: studentId, addresseeId: other.studentId },
            { requesterId: other.studentId, addresseeId: studentId },
          ],
        },
        select: { id: true },
      }),
      this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: studentId, blockedId: other.studentId },
            { blockerId: other.studentId, blockedId: studentId },
          ],
        },
        select: { id: true },
      }),
    ]);
    return connection !== null && block === null;
  }
}
