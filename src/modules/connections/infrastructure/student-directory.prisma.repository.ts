import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { StudentSummary } from '../domain/entities/student-summary.entity';
import {
  StudentDirectoryRepository,
  StudentSummaryPage,
} from '../domain/student-directory.repository';
import { ConnectionMapper } from './connection.mapper';

const SUMMARY_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} satisfies Prisma.StudentSelect;

/** Prisma read port over the `students` table for discovery + summary hydration. */
@Injectable()
export class StudentDirectoryPrismaRepository implements StudentDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async exists(studentId: string): Promise<boolean> {
    return (await this.prisma.student.count({ where: { id: studentId } })) > 0;
  }

  async findSummary(studentId: string): Promise<StudentSummary | null> {
    const row = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: SUMMARY_SELECT,
    });
    return row === null ? null : ConnectionMapper.toSummary(row);
  }

  async findSummaries(ids: string[]): Promise<StudentSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      select: SUMMARY_SELECT,
    });
    return rows.map(ConnectionMapper.toSummary);
  }

  async search(
    query: string,
    excludeIds: string[],
    page: number,
    size: number,
  ): Promise<StudentSummaryPage> {
    const where: Prisma.StudentWhereInput = {
      id: { notIn: excludeIds },
      OR: [
        { username: { startsWith: query, mode: 'insensitive' } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ username: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items: rows.map(ConnectionMapper.toSummary), total };
  }
}
