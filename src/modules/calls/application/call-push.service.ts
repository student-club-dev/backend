import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApnsPushProvider } from '../../../infrastructure/push/apns-push.provider';
import { FcmPushProvider } from '../../../infrastructure/push/fcm-push.provider';
import type { PushOutcome, PushTarget } from '../../../infrastructure/push/push-provider';
import {
  CALL_DEVICE_DIRECTORY,
  CallDevice,
  CallDeviceDirectoryRepository,
} from '../domain/call-device.repository';
import { CallMedia } from '../domain/enums/call-media.enum';
import { RING_TIMEOUT_MS } from '../domain/call-timings';

/** What the callee's phone is told about an incoming call (§7.4 / §7.5). */
export interface RingParams {
  calleeId: string;
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl: string | null;
  media: CallMedia;
  /** ISO-8601. In the payload so a late push can be discarded unopened (§7.7). */
  expiresAt: string;
}

/** How long an undelivered call push is still worth delivering — the ring timeout, in seconds. */
const CALL_PUSH_TTL_SECONDS = Math.ceil(RING_TIMEOUT_MS / 1000);

/**
 * Rings a phone whose app is not running (calls spec §7).
 *
 * This is the part of calling that is easiest to leave out and impossible to do without: when the
 * app is closed the WebSocket is closed too, `call:incoming` never arrives, and a phone that does
 * not ring means the feature does not exist for that user.
 *
 * Two channels, because there is no single one that works:
 *
 *  - **iOS** — APNs directly with `apns-push-type: voip`. FCM cannot set that header, which is why
 *    this cannot go through the same path as a message.
 *  - **Android** — FCM, data-only, high priority, so `onMessageReceived` runs even in Doze.
 *
 * Every send is best-effort and never throws: a call must not fail because a push did.
 */
@Injectable()
export class CallPushService {
  private readonly logger = new Logger(CallPushService.name);

  constructor(
    @Inject(CALL_DEVICE_DIRECTORY) private readonly devices: CallDeviceDirectoryRepository,
    private readonly apns: ApnsPushProvider,
    private readonly fcm: FcmPushProvider,
  ) {}

  /**
   * Tells the callee's devices a call is coming.
   *
   * ⚠️ Sent **even when their socket is open**, unlike every other push (§7.6). The check would lie:
   * iOS freezes a WebSocket seconds after the app backgrounds, but the server still sees the socket
   * as connected — so "they are online, skip the push" is exactly how a call goes silently missing.
   * Two arrivals are harmless; the client de-duplicates on `callId`, which is why it is mandatory
   * in the payload.
   */
  async ring(params: RingParams): Promise<void> {
    await this.deliver(params.calleeId, {
      type: 'call',
      callId: params.callId,
      conversationId: params.conversationId,
      callerId: params.callerId,
      callerName: params.callerName,
      ...(params.callerAvatarUrl === null ? {} : { callerAvatarUrl: params.callerAvatarUrl }),
      media: params.media,
      expiresAt: params.expiresAt,
    });
  }

  /**
   * Stops a phone ringing for a call that is over (§7.7) — the caller hung up, another device
   * answered, or it timed out.
   *
   * Without this the phone rings into an empty room and the user answers to find nobody there,
   * which is the most visible defect a calling feature can have. On iOS it must be another **VoIP**
   * push: the app may be suspended again by now, and only a VoIP push wakes it to close the CallKit
   * session.
   */
  async cancel(calleeId: string, callId: string): Promise<void> {
    await this.deliver(calleeId, { type: 'call_cancel', callId });
  }

  /** Both channels, concurrently; dead tokens pruned. Never throws. */
  private async deliver(studentId: string, data: Record<string, string>): Promise<void> {
    try {
      const [voip, android] = await Promise.all([
        this.devices.voipTokensFor(studentId),
        this.devices.androidTokensFor(studentId),
      ]);
      if (voip.length === 0 && android.length === 0) {
        return;
      }

      const outcomes = await Promise.allSettled([
        this.apns.sendVoip(toTargets(voip, 'IOS'), data),
        this.fcm.sendCallData(toTargets(android, 'ANDROID'), data, CALL_PUSH_TTL_SECONDS),
      ]);

      const dead = outcomes.flatMap((outcome) =>
        outcome.status === 'fulfilled' ? (outcome.value as PushOutcome).dead : [],
      );
      if (dead.length > 0) {
        await this.devices.removeDead(dead);
      }
    } catch (error) {
      this.logger.warn(
        { err: error, type: data.type, callId: data.callId },
        'call push delivery failed',
      );
    }
  }
}

function toTargets(devices: CallDevice[], platform: 'IOS' | 'ANDROID'): PushTarget[] {
  return devices.map((device) => ({
    id: device.id,
    token: device.token,
    platform,
    apnsEnv: device.apnsEnv,
  }));
}
