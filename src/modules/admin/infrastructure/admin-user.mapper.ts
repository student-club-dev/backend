import { Prisma } from '@prisma/client';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import {
  COURSE_YEAR_TO_DOMAIN,
  GENDER_TO_DOMAIN,
  LAST_SEEN_VISIBILITY_TO_DOMAIN,
} from '../../profiles/infrastructure/profile-enums.mapper';
import {
  AdminBusinessOwner,
  AdminBusinessOwnerSummary,
  AdminOwnerBusinessSummary,
} from '../domain/entities/admin-business-owner.entity';
import { AdminStudent, AdminStudentSummary } from '../domain/entities/admin-student.entity';
import { AdminUserStatus } from '../domain/enums/admin-user-status.enum';

// Explicit column allowlists — `passwordHash` is deliberately never selected, so it can never be
// read or leaked. The mapper owns these `select`s so the row types line up with the mappers.

export const ADMIN_STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  avatarUrl: true,
  phoneNumber: true,
  email: true,
  universityId: true,
  courseYear: true,
  status: true,
  bannedAt: true,
  banReason: true,
  createdAt: true,
} satisfies Prisma.StudentSelect;

export const ADMIN_STUDENT_DETAIL_SELECT = {
  id: true,
  email: true,
  phoneNumber: true,
  phoneVerified: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  username: true,
  gender: true,
  universityId: true,
  universityEmail: true,
  birthYear: true,
  courseYear: true,
  lastSeenAt: true,
  lastSeenVisibility: true,
  status: true,
  bannedAt: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StudentSelect;

export const ADMIN_OWNER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  email: true,
  status: true,
  bannedAt: true,
  banReason: true,
  createdAt: true,
  _count: { select: { businesses: true } },
} satisfies Prisma.BusinessOwnerSelect;

export const ADMIN_OWNER_DETAIL_SELECT = {
  id: true,
  email: true,
  phoneNumber: true,
  phoneVerified: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  gender: true,
  status: true,
  bannedAt: true,
  banReason: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { businesses: true } },
} satisfies Prisma.BusinessOwnerSelect;

export const ADMIN_OWNER_BUSINESS_SELECT = {
  id: true,
  name: true,
  type: true,
  status: true,
  createdAt: true,
  _count: { select: { listings: true } },
} satisfies Prisma.BusinessSelect;

type AdminStudentSummaryRow = Prisma.StudentGetPayload<{
  select: typeof ADMIN_STUDENT_SUMMARY_SELECT;
}>;
type AdminStudentDetailRow = Prisma.StudentGetPayload<{
  select: typeof ADMIN_STUDENT_DETAIL_SELECT;
}>;
type AdminOwnerSummaryRow = Prisma.BusinessOwnerGetPayload<{
  select: typeof ADMIN_OWNER_SUMMARY_SELECT;
}>;
type AdminOwnerDetailRow = Prisma.BusinessOwnerGetPayload<{
  select: typeof ADMIN_OWNER_DETAIL_SELECT;
}>;
type AdminOwnerBusinessRow = Prisma.BusinessGetPayload<{
  select: typeof ADMIN_OWNER_BUSINESS_SELECT;
}>;

/** Maps admin read rows to plain domain objects. Prisma enums carry the same wire values as ours. */
export class AdminUserMapper {
  static toStudentSummary(row: AdminStudentSummaryRow): AdminStudentSummary {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
      avatarUrl: row.avatarUrl,
      phoneNumber: row.phoneNumber,
      email: row.email,
      universityId: row.universityId,
      courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
      status: AdminUserStatus[row.status],
      bannedAt: row.bannedAt,
      banReason: row.banReason,
      createdAt: row.createdAt,
    };
  }

  static toStudent(row: AdminStudentDetailRow): AdminStudent {
    return {
      id: row.id,
      email: row.email,
      phoneNumber: row.phoneNumber,
      phoneVerified: row.phoneVerified,
      emailVerified: row.emailVerified,
      firstName: row.firstName,
      lastName: row.lastName,
      avatarUrl: row.avatarUrl,
      username: row.username,
      gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
      universityId: row.universityId,
      universityEmail: row.universityEmail,
      birthYear: row.birthYear,
      courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
      lastSeenAt: row.lastSeenAt,
      lastSeenVisibility: LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility],
      status: AdminUserStatus[row.status],
      bannedAt: row.bannedAt,
      banReason: row.banReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  static toOwnerSummary(row: AdminOwnerSummaryRow): AdminBusinessOwnerSummary {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      phoneNumber: row.phoneNumber,
      email: row.email,
      businessesCount: row._count.businesses,
      status: AdminUserStatus[row.status],
      bannedAt: row.bannedAt,
      banReason: row.banReason,
      createdAt: row.createdAt,
    };
  }

  static toOwner(row: AdminOwnerDetailRow): AdminBusinessOwner {
    return {
      id: row.id,
      email: row.email,
      phoneNumber: row.phoneNumber,
      phoneVerified: row.phoneVerified,
      emailVerified: row.emailVerified,
      firstName: row.firstName,
      lastName: row.lastName,
      avatarUrl: row.avatarUrl,
      gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
      businessesCount: row._count.businesses,
      status: AdminUserStatus[row.status],
      bannedAt: row.bannedAt,
      banReason: row.banReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  static toOwnerBusiness(row: AdminOwnerBusinessRow): AdminOwnerBusinessSummary {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: BusinessStatus[row.status],
      listingsCount: row._count.listings,
      createdAt: row.createdAt,
    };
  }
}
