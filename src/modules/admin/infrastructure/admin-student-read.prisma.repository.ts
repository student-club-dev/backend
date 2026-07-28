import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  COURSE_YEAR_TO_PRISMA,
  GENDER_TO_PRISMA,
} from '../../profiles/infrastructure/profile-enums.mapper';
import {
  AdminStudentListFilter,
  AdminStudentPage,
  AdminStudentReadRepository,
} from '../domain/admin-student-read.repository';
import { AdminStudent } from '../domain/entities/admin-student.entity';
import { AdminUserSort } from '../domain/enums/admin-user-sort.enum';
import {
  ADMIN_STUDENT_DETAIL_SELECT,
  ADMIN_STUDENT_SUMMARY_SELECT,
  AdminUserMapper,
} from './admin-user.mapper';

const ORDER_BY: Record<AdminUserSort, Prisma.StudentOrderByWithRelationInput[]> = {
  [AdminUserSort.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [AdminUserSort.OLDEST]: [{ createdAt: 'asc' }, { id: 'asc' }],
};

/** Prisma read port over the whole `students` table for the admin panel. Prisma is used ONLY here. */
@Injectable()
export class AdminStudentReadPrismaRepository implements AdminStudentReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminStudentListFilter): Promise<AdminStudentPage> {
    const where = this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: ADMIN_STUDENT_SUMMARY_SELECT,
        orderBy: ORDER_BY[filter.sort],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items: rows.map(AdminUserMapper.toStudentSummary), total };
  }

  async findById(id: string): Promise<AdminStudent | null> {
    const row = await this.prisma.student.findUnique({
      where: { id },
      select: ADMIN_STUDENT_DETAIL_SELECT,
    });
    return row === null ? null : AdminUserMapper.toStudent(row);
  }

  /** Every filter narrows (AND); `q` ORs across the searchable columns. */
  private buildWhere(filter: AdminStudentListFilter): Prisma.StudentWhereInput {
    const where: Prisma.StudentWhereInput = {};
    if (filter.q !== null) {
      where.OR = [
        { firstName: { contains: filter.q, mode: 'insensitive' } },
        { lastName: { contains: filter.q, mode: 'insensitive' } },
        { username: { contains: filter.q, mode: 'insensitive' } },
        { phoneNumber: { contains: filter.q, mode: 'insensitive' } },
        { email: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.universityId !== null) {
      where.universityId = filter.universityId;
    }
    if (filter.courseYear !== null) {
      where.courseYear = COURSE_YEAR_TO_PRISMA[filter.courseYear];
    }
    if (filter.gender !== null) {
      where.gender = GENDER_TO_PRISMA[filter.gender];
    }
    if (filter.status !== null) {
      // AdminUserStatus and Prisma StudentStatus share wire values — index the Prisma enum by ours.
      where.status = StudentStatus[filter.status];
    }
    if (filter.phoneVerified !== null) {
      where.phoneVerified = filter.phoneVerified;
    }
    if (filter.createdFrom !== null || filter.createdTo !== null) {
      where.createdAt = {
        ...(filter.createdFrom === null ? {} : { gte: filter.createdFrom }),
        ...(filter.createdTo === null ? {} : { lte: filter.createdTo }),
      };
    }
    return where;
  }
}
