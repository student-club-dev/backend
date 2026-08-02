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
  apnsEnv: ApnsEnvironment | null;
}

/**
 * Device-token data access. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure.
 */
export interface DeviceTokenRepository {
  /** Registers (or re-assigns) a token to a student — a token identifies one device. */
  upsert(studentId: string, token: string, platform: DevicePlatform): Promise<void>;

  /** Removes a token the student owns (on logout). */
  remove(studentId: string, token: string): Promise<void>;

  /** Every device a student can be reached on (empty when none). */
  targetsFor(studentId: string): Promise<DeviceTarget[]>;

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
