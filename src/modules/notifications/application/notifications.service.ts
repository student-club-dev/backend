import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  PUSH_PROVIDER,
  PushNotification,
  PushProvider,
} from '../../../infrastructure/push/push-provider';
import { DEVICE_TOKEN_REPOSITORY, DeviceTokenRepository } from '../domain/device-token.repository';
import { DevicePlatform } from '../domain/enums/device-platform.enum';

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

  registerDevice(user: AuthenticatedUser, token: string, platform: DevicePlatform): Promise<void> {
    return this.devices.upsert(user.id, token, platform);
  }

  removeDevice(user: AuthenticatedUser, token: string): Promise<void> {
    return this.devices.remove(user.id, token);
  }

  /** Push to all of a student's devices (best-effort; a no-op when they have no tokens). */
  async pushToStudent(studentId: string, notification: PushNotification): Promise<void> {
    const tokens = await this.devices.tokensFor(studentId);
    if (tokens.length === 0) {
      return;
    }
    await this.push.send(tokens, notification);
  }
}
