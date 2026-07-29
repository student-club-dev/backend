import { Injectable } from '@nestjs/common';
import { DevicePlatform as PrismaDevicePlatform } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DeviceTokenRepository } from '../domain/device-token.repository';
import { DevicePlatform } from '../domain/enums/device-platform.enum';

/** Prisma implementation of the device-token repository port. Prisma is used ONLY here. */
@Injectable()
export class DeviceTokenPrismaRepository implements DeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(studentId: string, token: string, platform: DevicePlatform): Promise<void> {
    // A token is globally unique — upsert re-assigns it if it moved to another student/device.
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { studentId, token, platform: PrismaDevicePlatform[platform] },
      update: { studentId, platform: PrismaDevicePlatform[platform] },
    });
  }

  async remove(studentId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { studentId, token } });
  }

  async tokensFor(studentId: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { studentId },
      select: { token: true },
    });
    return rows.map((row) => row.token);
  }

  async removeMany(tokens: string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
  }
}
