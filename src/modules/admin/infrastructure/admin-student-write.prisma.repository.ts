import { Injectable } from '@nestjs/common';
import { ListingStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  COURSE_YEAR_TO_PRISMA,
  GENDER_TO_PRISMA,
} from '../../profiles/infrastructure/profile-enums.mapper';
import {
  AdminCreateStudentData,
  AdminStudentWriteRepository,
} from '../domain/admin-student-write.repository';

/** Prisma write port over the `students` table for the admin panel. Prisma is used ONLY here. */
@Injectable()
export class AdminStudentWritePrismaRepository implements AdminStudentWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async existsByEmail(email: string): Promise<boolean> {
    return (await this.prisma.student.count({ where: { email } })) > 0;
  }

  async existsByPhone(phoneNumber: string): Promise<boolean> {
    return (await this.prisma.student.count({ where: { phoneNumber } })) > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    return (await this.prisma.student.count({ where: { username } })) > 0;
  }

  async create(data: AdminCreateStudentData): Promise<string> {
    const row = await this.prisma.student.create({
      data: {
        email: data.email,
        phoneNumber: data.phoneNumber,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        avatarUrl: data.avatarUrl,
        gender: data.gender === null ? null : GENDER_TO_PRISMA[data.gender],
        universityId: data.universityId,
        universityEmail: data.universityEmail,
        birthYear: data.birthYear,
        courseYear: data.courseYear === null ? null : COURSE_YEAR_TO_PRISMA[data.courseYear],
      },
      select: { id: true },
    });
    return row.id;
  }

  async ban(id: string, reason: string): Promise<void> {
    // Status change + session revocation in one transaction, so a banned student can never keep
    // an active refresh token.
    await this.prisma.$transaction([
      this.prisma.student.update({
        where: { id },
        data: { status: StudentStatus.BANNED, bannedAt: new Date(), banReason: reason },
      }),
      this.prisma.studentRefreshToken.updateMany({
        where: { studentId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Everything the closure has to be true of, atomically (15-deletion.md §3).
   *
   * Each statement closes a different way the account could keep acting after it is gone:
   * a live refresh token, a phone that keeps ringing with pushes, or a listing still sitting in
   * the feed with nobody behind it.
   */
  async softDelete(id: string, reason: string | null): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.student.update({
        where: { id },
        data: { status: StudentStatus.DELETED, deletedAt: now, deletedReason: reason },
      }),
      this.prisma.studentRefreshToken.updateMany({
        where: { studentId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
      // Not soft: a token addresses a handset, and a closed account must stop reaching it.
      this.prisma.deviceToken.deleteMany({ where: { studentId: id } }),
      // Their own listings leave the feed. `deletedAt` rather than a status change, matching what
      // the owner's own DELETE does — an archived-but-not-deleted listing would still be findable.
      this.prisma.studentListing.updateMany({
        where: { ownerId: id, deletedAt: null },
        data: { deletedAt: now, status: ListingStatus.ARCHIVED },
      }),
    ]);
  }

  async unban(id: string): Promise<void> {
    await this.prisma.student.update({
      where: { id },
      data: { status: StudentStatus.ACTIVE, bannedAt: null, banReason: null },
    });
  }
}
