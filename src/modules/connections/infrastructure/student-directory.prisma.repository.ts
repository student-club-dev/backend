import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  COURSE_YEAR_TO_PRISMA,
  GENDER_TO_PRISMA,
} from '../../profiles/infrastructure/profile-enums.mapper';
import { StudentSummary } from '../domain/entities/student-summary.entity';
import {
  StudentDirectoryRepository,
  StudentListFilter,
  StudentSort,
  StudentSummaryPage,
} from '../domain/student-directory.repository';
import { ConnectionMapper, PROFILE_PHOTOS_INCLUDE } from './connection.mapper';

const SUMMARY_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  bio: true,
  universityId: true,
  gender: true,
  courseYear: true,
  lastSeenAt: true,
  lastSeenVisibility: true,
  // Read raw and masked per-reader by `applyPresenceVisibility` — never serialised straight through.
  phoneNumber: true,
  phoneVisibility: true,
  profilePhotos: PROFILE_PHOTOS_INCLUDE,
} satisfies Prisma.StudentSelect;

const ORDER_BY: Record<StudentSort, Prisma.StudentOrderByWithRelationInput[]> = {
  [StudentSort.RECENT]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [StudentSort.NAME]: [{ username: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
};

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

  async list(
    filter: StudentListFilter,
    excludeIds: string[],
    restrictToIds: string[] | null,
    page: number,
    size: number,
  ): Promise<StudentSummaryPage> {
    // An explicit "keep only these" narrowing that resolved to nothing — no row can match.
    if (restrictToIds !== null && restrictToIds.length === 0) {
      return { items: [], total: 0 };
    }
    const where = this.buildWhere(filter, excludeIds, restrictToIds);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: ORDER_BY[filter.sort],
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items: rows.map(ConnectionMapper.toSummary), total };
  }

  /** Every filter narrows (AND); the multi-value ones are ORs within their own column. */
  private buildWhere(
    filter: StudentListFilter,
    excludeIds: string[],
    restrictToIds: string[] | null,
  ): Prisma.StudentWhereInput {
    const where: Prisma.StudentWhereInput = { id: { notIn: excludeIds } };
    if (restrictToIds !== null) {
      where.id = { notIn: excludeIds, in: restrictToIds };
    }
    if (filter.q !== null) {
      where.OR = [
        { username: { startsWith: filter.q, mode: 'insensitive' } },
        { firstName: { contains: filter.q, mode: 'insensitive' } },
        { lastName: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.universityIds.length > 0) {
      where.universityId = { in: filter.universityIds };
    }
    if (filter.genders.length > 0) {
      where.gender = { in: filter.genders.map((gender) => GENDER_TO_PRISMA[gender]) };
    }
    if (filter.courseYears.length > 0) {
      where.courseYear = { in: filter.courseYears.map((year) => COURSE_YEAR_TO_PRISMA[year]) };
    }
    if (filter.birthYearFrom !== null || filter.birthYearTo !== null) {
      where.birthYear = {
        ...(filter.birthYearFrom === null ? {} : { gte: filter.birthYearFrom }),
        ...(filter.birthYearTo === null ? {} : { lte: filter.birthYearTo }),
      };
    }
    return where;
  }
}
