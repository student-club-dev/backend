import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CallDirectoryRepository } from '../domain/call-directory.repository';

/** Prisma implementation of the report-side call lookup. Prisma is used ONLY here. */
@Injectable()
export class CallDirectoryPrismaRepository implements CallDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async wasParticipant(callId: string, studentId: string): Promise<boolean> {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, OR: [{ callerId: studentId }, { calleeId: studentId }] },
      select: { id: true },
    });
    return call !== null;
  }
}
