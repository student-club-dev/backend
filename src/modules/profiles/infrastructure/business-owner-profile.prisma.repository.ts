import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Profile, ProfilePatch } from '../domain/entities/profile.entity';
import { ProfileRepository } from '../domain/profile.repository';
import { toBusinessProfile, toBusinessUpdateData } from './profile.mapper';

/** Prisma implementation of ProfileRepository for the `business_owners` table. Prisma is used ONLY here. */
@Injectable()
export class BusinessOwnerProfilePrismaRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Profile | null> {
    const row = await this.prisma.businessOwner.findUnique({ where: { id } });
    return row === null ? null : toBusinessProfile(row);
  }

  async findByPhone(phoneNumber: string): Promise<Profile | null> {
    const row = await this.prisma.businessOwner.findUnique({ where: { phoneNumber } });
    return row === null ? null : toBusinessProfile(row);
  }

  async update(id: string, patch: ProfilePatch): Promise<Profile> {
    const row = await this.prisma.businessOwner.update({
      where: { id },
      data: toBusinessUpdateData(patch),
    });
    return toBusinessProfile(row);
  }
}
