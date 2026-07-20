import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BusinessOwnerRepository } from '../domain/business-owner.repository';

/** Prisma implementation of the business-owner lookup port. Prisma is used ONLY here. */
@Injectable()
export class BusinessOwnerPrismaRepository implements BusinessOwnerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPhoneVerified(ownerId: string): Promise<boolean | null> {
    const row = await this.prisma.businessOwner.findUnique({
      where: { id: ownerId },
      select: { phoneVerified: true },
    });
    return row === null ? null : row.phoneVerified;
  }
}
