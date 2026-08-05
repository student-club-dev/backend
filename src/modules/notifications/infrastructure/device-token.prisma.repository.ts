import { Injectable } from '@nestjs/common';
import {
  DevicePlatform as PrismaDevicePlatform,
  DeviceTokenType as PrismaDeviceTokenType,
  type DeviceToken as PrismaDeviceToken,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  ApnsEnvironment,
  DeviceTarget,
  DeviceTokenRepository,
} from '../domain/device-token.repository';
import { DevicePlatform } from '../domain/enums/device-platform.enum';
import { DeviceTokenType } from '../domain/enums/device-token-type.enum';

/** Prisma implementation of the device-token repository port. Prisma is used ONLY here. */
@Injectable()
export class DeviceTokenPrismaRepository implements DeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    studentId: string,
    token: string,
    platform: DevicePlatform,
    tokenType: DeviceTokenType,
  ): Promise<void> {
    // A token is globally unique — upsert re-assigns it if it moved to another student/device.
    // `tokenType` is rewritten on update as well: the same string cannot be two channels at once,
    // and the registering client is the only thing that knows which API produced it.
    const data = {
      platform: PrismaDevicePlatform[platform],
      tokenType: PrismaDeviceTokenType[tokenType],
    };
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { studentId, token, ...data },
      update: { studentId, ...data },
    });
  }

  async remove(studentId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { studentId, token } });
  }

  /**
   * ⚠️ `not: APNS_VOIP` is load-bearing. A VoIP token that received an ordinary notification costs
   * the user their calls, not just that notification (see `DeviceTokenType`), so the exclusion
   * lives in the query where no caller can omit it.
   */
  async targetsFor(studentId: string): Promise<DeviceTarget[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { studentId, tokenType: { not: PrismaDeviceTokenType.APNS_VOIP } },
      select: SELECT,
    });
    return rows.map(toTarget);
  }

  async callTargetsFor(studentId: string, tokenType: DeviceTokenType): Promise<DeviceTarget[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { studentId, tokenType: PrismaDeviceTokenType[tokenType] },
      select: SELECT,
    });
    return rows.map(toTarget);
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

const SELECT = { id: true, token: true, platform: true, tokenType: true, apnsEnv: true } as const;

function toTarget(row: Pick<PrismaDeviceToken, keyof typeof SELECT>): DeviceTarget {
  return {
    id: row.id,
    token: row.token,
    platform: DevicePlatform[row.platform],
    tokenType: DeviceTokenType[row.tokenType],
    apnsEnv: row.apnsEnv,
  };
}
