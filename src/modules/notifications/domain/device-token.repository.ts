import { DeviceTokenType } from './enums/device-token-type.enum';
import { DevicePlatform } from './enums/device-platform.enum';

/** Injection token for the device-token repository port (bound to the Prisma impl in the module). */
export const DEVICE_TOKEN_REPOSITORY = Symbol('DEVICE_TOKEN_REPOSITORY');

/**
 * Which APNs host a device belongs to. A plain union rather than an enum: the same two strings
 * travel from Prisma through this port into the push provider, and a union crosses all three
 * without conversion.
 */
export type ApnsEnvironment = 'PRODUCTION' | 'SANDBOX';

/**
 * A device to deliver to. `platform` decides which service can reach it at all — an iPhone's APNs
 * token is meaningless to FCM — and `apnsEnv` records which of Apple's two hosts accepted it,
 * `null` while that is still unknown.
 */
export interface DeviceTarget {
  id: string;
  token: string;
  platform: DevicePlatform;
  /** Which channel this token belongs to. A VoIP row is only ever selected by a call. */
  tokenType: DeviceTokenType;
  apnsEnv: ApnsEnvironment | null;
}

/**
 * Device-token data access. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure.
 */
export interface DeviceTokenRepository {
  /** Registers (or re-assigns) a token to a student — a token identifies one device. */
  upsert(
    studentId: string,
    token: string,
    platform: DevicePlatform,
    tokenType: DeviceTokenType,
  ): Promise<void>;

  /** Removes a token the student owns (on logout). */
  remove(studentId: string, token: string): Promise<void>;

  /**
   * The devices an **ordinary** notification may reach — VoIP rows deliberately excluded.
   *
   * The exclusion is in the query, not left to callers, because the cost of forgetting it is not a
   * stray notification: a non-call payload on the VoIP channel can cost the user every future call
   * (see `DeviceTokenType`). No caller should have to remember that.
   */
  targetsFor(studentId: string): Promise<DeviceTarget[]>;

  /** The devices a **call** may ring, of one specific channel. */
  callTargetsFor(studentId: string, tokenType: DeviceTokenType): Promise<DeviceTarget[]>;

  /**
   * Records a successful delivery: stamps `lastSuccessAt`, and for iOS stores the environment that
   * accepted the token so later sends address the right host instead of probing both.
   */
  markDelivered(deliveries: { token: string; apnsEnv: ApnsEnvironment | null }[]): Promise<void>;

  /**
   * Deletes tokens the provider reported as permanently invalid — an uninstalled app or a reissued
   * token. Not scoped to a student on purpose: the provider knows the token is dead wherever it
   * happens to be registered.
   */
  removeMany(tokens: string[]): Promise<void>;
}
