import { Redemption as PrismaRedemption, Student } from '@prisma/client';
import { Redemption, StudentBrief } from '../domain/entities/redemption.entity';
import { RedemptionStatus } from '../domain/enums/redemption-status.enum';

/** The student columns needed for a StudentBrief — the shared `select` for redemption reads. */
export type StudentBriefRow = Pick<
  Student,
  'id' | 'firstName' | 'lastName' | 'username' | 'universityId'
>;

/** Maps Prisma redemption/student rows to the domain. Money is `BigInt` in Prisma → `number`. */
export class RedemptionMapper {
  static toDomain(row: PrismaRedemption): Redemption {
    return {
      id: row.id,
      listingId: row.listingId,
      studentId: row.studentId,
      branchId: row.branchId,
      code: row.code,
      status: RedemptionStatus[row.status],
      amount: row.amount === null ? null : Number(row.amount),
      expiresAt: row.expiresAt,
      redeemedAt: row.redeemedAt,
      createdAt: row.createdAt,
    };
  }

  static toStudentBrief(row: StudentBriefRow): StudentBrief {
    const fullName = [row.firstName, row.lastName].filter((part) => part).join(' ') || null;
    return { id: row.id, fullName, username: row.username, universityId: row.universityId };
  }
}
