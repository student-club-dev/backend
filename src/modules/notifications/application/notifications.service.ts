import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  PUSH_PROVIDER,
  PushNotification,
  PushProvider,
} from '../../../infrastructure/push/push-provider';
import { DEVICE_TOKEN_REPOSITORY, DeviceTokenRepository } from '../domain/device-token.repository';
import { DevicePlatform } from '../domain/enums/device-platform.enum';

/** An APNs device token is 32 bytes hex-encoded — exactly what `iOSApp.swift` registers. */
const APNS_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Notifications use-cases (chat.md C8): device-token registration and offline push. Other modules
 * (chat) call `pushToStudent` to deliver a push when the recipient is offline. Depends on the
 * repository + push-provider ports only.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepository,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  /**
   * An iOS token is checked against the APNs format before it is stored. Accepting anything would
   * let a build that still registers an FCM token look healthy while Apple rejects every send —
   * the failure this whole path exists to make impossible to miss.
   */
  async registerDevice(
    user: AuthenticatedUser,
    token: string,
    platform: DevicePlatform,
  ): Promise<void> {
    if (platform === DevicePlatform.IOS && !APNS_TOKEN_PATTERN.test(token)) {
      throw new AppException(ERROR_CODE.INVALID_DEVICE_TOKEN, 422, 'Qurilma tokeni noto‘g‘ri', {
        token: 'iOS uchun APNs tokeni kerak — 64 ta hex belgi',
      });
    }
    await this.devices.upsert(user.id, token, platform);
  }

  removeDevice(user: AuthenticatedUser, token: string): Promise<void> {
    return this.devices.remove(user.id, token);
  }

  /**
   * Push to all of a student's devices (best-effort; a no-op when they have no tokens). Each device
   * goes to the service that can reach it — the provider routes iPhones to APNs and the rest to FCM
   * — so one platform failing never costs the other its notification.
   *
   * Tokens the provider rejects as permanently dead are deleted here. Without that they pile up on
   * every account that ever reinstalled the app, and each later send pays to retry them.
   */
  async pushToStudent(studentId: string, notification: PushNotification): Promise<void> {
    const targets = await this.devices.targetsFor(studentId);
    if (targets.length === 0) {
      return;
    }
    const outcome = await this.push.send(targets, notification);
    if (outcome.dead.length > 0) {
      await this.devices.removeMany(outcome.dead);
    }
    if (outcome.delivered.length > 0) {
      await this.devices.markDelivered(outcome.delivered);
    }
  }
}
