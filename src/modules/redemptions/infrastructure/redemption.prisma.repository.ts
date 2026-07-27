import { Injectable } from '@nestjs/common';
import { Prisma, RedemptionStatus as PrismaRedemptionStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Redemption, StudentBrief } from '../domain/entities/redemption.entity';
import {
  CreatePendingData,
  RedemptionPage,
  RedemptionRepository,
} from '../domain/redemption.repository';
import { RedemptionMapper } from './redemption.mapper';

const STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  universityId: true,
} satisfies Prisma.StudentSelect;

/** Prisma implementation of the redemption repository port. Prisma is used ONLY here. */
@Injectable()
export class RedemptionPrismaRepository implements RedemptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<Redemption | null> {
    const row = await this.prisma.redemption.findUnique({ where: { code } });
    return row === null ? null : RedemptionMapper.toDomain(row);
  }

  async findUnexpiredPending(
    studentId: string,
    listingId: string,
    now: Date,
  ): Promise<Redemption | null> {
    const row = await this.prisma.redemption.findFirst({
      where: {
        studentId,
        listingId,
        status: PrismaRedemptionStatus.PENDING,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    return row === null ? null : RedemptionMapper.toDomain(row);
  }

  async createPending(data: CreatePendingData): Promise<Redemption> {
    const row = await this.prisma.redemption.create({
      data: {
        listingId: data.listingId,
        studentId: data.studentId,
        code: data.code,
        status: PrismaRedemptionStatus.PENDING,
        expiresAt: data.expiresAt,
      },
    });
    return RedemptionMapper.toDomain(row);
  }

  async confirm(
    id: string,
    branchId: string | null,
    amount: number | null,
    redeemedAt: Date,
  ): Promise<Redemption | null> {
    return this.prisma.$transaction(async (tx) => {
      // Guard on the current PENDING status — a concurrent confirm makes count 0 (⇒ already redeemed).
      const updated = await tx.redemption.updateMany({
        where: { id, status: PrismaRedemptionStatus.PENDING },
        data: {
          status: PrismaRedemptionStatus.CONFIRMED,
          branchId,
          amount: amount === null ? null : BigInt(amount),
          redeemedAt,
        },
      });
      if (updated.count === 0) {
        return null;
      }
      const row = await tx.redemption.findUniqueOrThrow({ where: { id } });
      await tx.listing.update({
        where: { id: row.listingId },
        data: { usedCount: { increment: 1 } },
      });
      return RedemptionMapper.toDomain(row);
    });
  }

  async countConfirmed(
    listingId: string,
    studentId: string | null,
    since: Date | null,
  ): Promise<number> {
    return this.prisma.redemption.count({
      where: {
        listingId,
        status: PrismaRedemptionStatus.CONFIRMED,
        ...(studentId === null ? {} : { studentId }),
        ...(since === null ? {} : { redeemedAt: { gte: since } }),
      },
    });
  }

  async findStudentBrief(studentId: string): Promise<StudentBrief | null> {
    const row = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: STUDENT_SELECT,
    });
    return row === null ? null : RedemptionMapper.toStudentBrief(row);
  }

  async listConfirmedByListing(
    listingId: string,
    page: number,
    size: number,
  ): Promise<RedemptionPage> {
    const where: Prisma.RedemptionWhereInput = {
      listingId,
      status: PrismaRedemptionStatus.CONFIRMED,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.redemption.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: { student: { select: STUDENT_SELECT } },
      }),
      this.prisma.redemption.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        redemption: RedemptionMapper.toDomain(row),
        student: RedemptionMapper.toStudentBrief(row.student),
      })),
      total,
    };
  }
}
