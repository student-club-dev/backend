import { Injectable } from '@nestjs/common';
import { DevicePlatform as PrismaDevicePlatform } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  ApnsEnvironment,
  DeviceTarget,
  DeviceTokenRepository,
} from '../domain/device-token.repository';
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

  async targetsFor(studentId: string): Promise<DeviceTarget[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { studentId },
      select: { id: true, token: true, platform: true, apnsEnv: true },
    });
    return rows.map((row) => ({
      id: row.id,
      token: row.token,
      platform: DevicePlatform[row.platform],
      apnsEnv: row.apnsEnv,
    }));
  }

  /**
   * One statement per environment instead of per token: a send reaches a handful of devices that
   * almost always share an environment, so this is two `UPDATE … WHERE token IN (…)` at most.
   */
  async markDelivered(
    deliveries: { token: string; apnsEnv: ApnsEnvironment | null }[],
  ): Promise<void> {
    if (deliveries.length === 0) {
      return;
    }
    const byEnv = new Map<ApnsEnvironment | null, string[]>();
    for (const delivery of deliveries) {
      const tokens = byEnv.get(delivery.apnsEnv) ?? [];
      tokens.push(delivery.token);
      byEnv.set(delivery.apnsEnv, tokens);
    }
    const now = new Date();
    await Promise.all(
      [...byEnv].map(([apnsEnv, tokens]) =>
        this.prisma.deviceToken.updateMany({
          where: { token: { in: tokens } },
          // A null environment (FCM) must not erase one already learned for an iOS row.
          data: apnsEnv === null ? { lastSuccessAt: now } : { lastSuccessAt: now, apnsEnv },
        }),
      ),
    );
  }

  async removeMany(tokens: string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
  }
}
