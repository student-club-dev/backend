import { Injectable } from '@nestjs/common';
import { DevicePlatform, DeviceTokenType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CallDevice, CallDeviceDirectoryRepository } from '../domain/call-device.repository';

const SELECT = { id: true, token: true, apnsEnv: true } as const;

/** Prisma implementation of the call-push device lookup. Prisma is used ONLY here. */
@Injectable()
export class CallDevicePrismaRepository implements CallDeviceDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async voipTokensFor(studentId: string): Promise<CallDevice[]> {
    return this.prisma.deviceToken.findMany({
      where: { studentId, tokenType: DeviceTokenType.APNS_VOIP },
      select: SELECT,
    });
  }

  /**
   * `platform: ANDROID` as well as `tokenType: FCM`, because a web registration is also FCM and a
   * browser tab cannot show a ringing screen — sending to it would be a notification nobody can
   * answer.
   */
  async androidTokensFor(studentId: string): Promise<CallDevice[]> {
    return this.prisma.deviceToken.findMany({
      where: { studentId, tokenType: DeviceTokenType.FCM, platform: DevicePlatform.ANDROID },
      select: SELECT,
    });
  }

  async removeDead(tokens: string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
  }
}
