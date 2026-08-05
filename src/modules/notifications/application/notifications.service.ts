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
import { DeviceTokenType } from '../domain/enums/device-token-type.enum';

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
    tokenType?: DeviceTokenType,
  ): Promise<void> {
    const channel = tokenType ?? defaultTokenTypeFor(platform);
    // A PushKit token is 32 bytes hex-encoded, exactly like an ordinary APNs one, so the same check
    // covers both iOS channels.
    if (isApnsChannel(channel) && !APNS_TOKEN_PATTERN.test(token)) {
      throw new AppException(ERROR_CODE.INVALID_DEVICE_TOKEN, 422, 'Qurilma tokeni noto‘g‘ri', {
        token: 'iOS uchun APNs tokeni kerak — 64 ta hex belgi',
      });
    }
    await this.devices.upsert(user.id, token, platform, channel);
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

/**
 * What a client that sends no `tokenType` meant (calls spec §7.3).
 *
 * ⚠️ iOS defaults to `APNS`, **not** `FCM` as the spec's table suggests. That table assumes FCM
 * relays to iOS; this backend stopped doing that — an iPhone registers its raw APNs token and is
 * delivered to through Apple directly. Defaulting it to `FCM` would mislabel every existing iOS
 * device and hand it to a service that cannot address it, which is precisely the bug the APNs work
 * fixed. Nothing is asked of the app: today's build sends no `tokenType` and gets the right one.
 */
export function defaultTokenTypeFor(platform: DevicePlatform): DeviceTokenType {
  return platform === DevicePlatform.IOS ? DeviceTokenType.APNS : DeviceTokenType.FCM;
}

/** Whether a channel is delivered by Apple, and therefore expects an APNs-format token. */
function isApnsChannel(tokenType: DeviceTokenType): boolean {
  return tokenType === DeviceTokenType.APNS || tokenType === DeviceTokenType.APNS_VOIP;
}
