import { Injectable } from '@nestjs/common';
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
}
