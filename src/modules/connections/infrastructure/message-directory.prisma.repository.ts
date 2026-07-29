import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  MessageDirectoryRepository,
  ReportableMessage,
} from '../domain/message-directory.repository';

/** Prisma implementation of the reportable-message port. Prisma is used ONLY here. */
@Injectable()
export class MessageDirectoryPrismaRepository implements MessageDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One query: the id must exist AND the reporter must be a member of its conversation. */
  findReportable(messageId: string, reporterId: string): Promise<ReportableMessage | null> {
    return this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: { members: { some: { studentId: reporterId } } },
      },
      select: { id: true, body: true },
    });
  }
}
