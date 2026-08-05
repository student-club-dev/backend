import { Injectable } from '@nestjs/common';
import { BusinessOwnerStatus, BusinessStatus, ListingStatus } from '@prisma/client';
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

  async softDelete(id: string, reason: string | null): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.businessOwner.update({
        where: { id },
        data: { status: BusinessOwnerStatus.DELETED, deletedAt: now, deletedReason: reason },
      }),
      this.prisma.businessOwnerRefreshToken.updateMany({
        where: { businessOwnerId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
      // The listings first, then the businesses that own them: both are matched by the owner id,
      // so the order does not change the result — but reading it this way makes it obvious that
      // nothing of theirs is left visible.
      //
      // `ARCHIVED` is the whole of it: unlike `students` and `student_listings`, neither table has
      // a `deleted_at` column — archiving IS their soft delete, and it is what the owner's own
      // `DELETE /v1/listings/:id` already does. Already-archived rows are skipped so a second run
      // cannot rewrite a status somebody set deliberately.
      this.prisma.listing.updateMany({
        where: { business: { ownerId: id }, status: { not: ListingStatus.ARCHIVED } },
        data: { status: ListingStatus.ARCHIVED },
      }),
      this.prisma.business.updateMany({
        where: { ownerId: id, status: { not: BusinessStatus.ARCHIVED } },
        data: { status: BusinessStatus.ARCHIVED },
      }),
    ]);
  }

  async unban(id: string): Promise<void> {
    await this.prisma.businessOwner.update({
      where: { id },
      data: { status: BusinessOwnerStatus.ACTIVE, bannedAt: null, banReason: null },
    });
  }
}
