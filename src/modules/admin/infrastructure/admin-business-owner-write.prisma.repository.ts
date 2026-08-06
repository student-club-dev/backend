import { Injectable } from '@nestjs/common';
import { BusinessOwnerStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { GENDER_TO_PRISMA } from '../../profiles/infrastructure/profile-enums.mapper';
import {
  AdminBusinessOwnerWriteRepository,
  AdminCreateOwnerData,
} from '../domain/admin-business-owner-write.repository';

/** Prisma write port over the `business_owners` table for the admin panel. Prisma ONLY here. */
@Injectable()
export class AdminBusinessOwnerWritePrismaRepository implements AdminBusinessOwnerWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async existsByEmail(email: string): Promise<boolean> {
    return (await this.prisma.businessOwner.count({ where: { email } })) > 0;
  }

  async existsByPhone(phoneNumber: string): Promise<boolean> {
    return (await this.prisma.businessOwner.count({ where: { phoneNumber } })) > 0;
  }

  async create(data: AdminCreateOwnerData): Promise<string> {
    const row = await this.prisma.businessOwner.create({
      data: {
        email: data.email,
        phoneNumber: data.phoneNumber,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
        gender: data.gender === null ? null : GENDER_TO_PRISMA[data.gender],
      },
      select: { id: true },
    });
    return row.id;
  }

  async ban(id: string, reason: string): Promise<void> {
    // Status change + session revocation in one transaction, so a banned owner can never keep
    // an active refresh token.
    await this.prisma.$transaction([
      this.prisma.businessOwner.update({
        where: { id },
        data: { status: BusinessOwnerStatus.BANNED, bannedAt: new Date(), banReason: reason },
      }),
      this.prisma.businessOwnerRefreshToken.updateMany({
        where: { businessOwnerId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Row delete (15-deletion.md §3). The owner leaves every list because it stops existing.
   *
   * The cascade runs two levels deeper than the student's: `business_owners` → `businesses` →
   * `listings` → `redemptions`. So this does not archive a shop, it removes it: every branch,
   * every offer it published, and every redemption students made against those offers. A student
   * who used a discount here loses that from their own history, and the counts behind it — how
   * many redemptions a period had — drop with it.
   *
   * Unrecoverable, with no backup and no restore endpoint. `ban()` is the reversible option.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.businessOwner.delete({ where: { id } });
  }

  async unban(id: string): Promise<void> {
    await this.prisma.businessOwner.update({
      where: { id },
      data: { status: BusinessOwnerStatus.ACTIVE, bannedAt: null, banReason: null },
    });
  }
}
