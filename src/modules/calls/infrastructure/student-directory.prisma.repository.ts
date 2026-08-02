import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CallerSummary, StudentDirectoryRepository } from '../domain/student-directory.repository';

/** The caller card `call:incoming` renders on the callee's ringing screen — nothing more. */
@Injectable()
export class StudentDirectoryPrismaRepository implements StudentDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(studentId: string): Promise<CallerSummary | null> {
    const row = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, username: true, avatarUrl: true },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      fullName: [row.firstName, row.lastName].filter((part) => part).join(' '),
      username: row.username,
      avatarUrl: row.avatarUrl,
    };
  }
}
