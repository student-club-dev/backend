import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ListingStatus as PrismaListingStatus,
  StudentListingKind as PrismaStudentListingKind,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { StudentListing } from '../../student-listings/domain/entities/student-listing.entity';
import {
  STUDENT_LISTING_INCLUDE,
  toListingEntity,
} from '../../student-listings/infrastructure/student-listing.mapper';
import {
  AdminStudentListingListFilter,
  AdminStudentListingPage,
  AdminStudentListingReadRepository,
} from '../domain/admin-student-listing-read.repository';

/** Prisma implementation of the admin student-listing reads. Prisma is used ONLY here. */
@Injectable()
export class AdminStudentListingReadPrismaRepository implements AdminStudentListingReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminStudentListingListFilter): Promise<AdminStudentListingPage> {
    const where = buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentListing.findMany({
        where,
        include: STUDENT_LISTING_INCLUDE,
        // Newest first: an admin arriving after a report wants what just happened, not the archive.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.studentListing.count({ where }),
    ]);
    return { items: rows.map(toListingEntity), total };
  }

  /**
   * No `deletedAt: null` here, deliberately: an admin following a link from a report must still be
   * able to open a listing whose owner deleted it in the meantime, or the trail simply ends.
   */
  async getById(id: string): Promise<StudentListing | null> {
    const row = await this.prisma.studentListing.findUnique({
      where: { id },
      include: STUDENT_LISTING_INCLUDE,
    });
    return row === null ? null : toListingEntity(row);
  }
}

function buildWhere(filter: AdminStudentListingListFilter): Prisma.StudentListingWhereInput {
  return {
    ...(filter.includeDeleted ? {} : { deletedAt: null }),
    ...(filter.kind === null ? {} : { kind: filter.kind as PrismaStudentListingKind }),
    ...(filter.ownerId === null ? {} : { ownerId: filter.ownerId }),
    ...(filter.statuses.length === 0
      ? {}
      : { status: { in: filter.statuses as PrismaListingStatus[] } }),
    ...(filter.q === null
      ? {}
      : {
          // Title and description only. The student-facing search uses the tsvector index; this is
          // a moderator typing a phrase they saw in a report, where a plain contains is both
          // simpler and more predictable — and this list is not on a hot path.
          OR: [
            { title: { contains: filter.q, mode: 'insensitive' } },
            { description: { contains: filter.q, mode: 'insensitive' } },
          ],
        }),
  };
}
