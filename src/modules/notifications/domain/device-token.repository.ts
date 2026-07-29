import { DevicePlatform } from './enums/device-platform.enum';

/** Injection token for the device-token repository port (bound to the Prisma impl in the module). */
export const DEVICE_TOKEN_REPOSITORY = Symbol('DEVICE_TOKEN_REPOSITORY');

/**
 * Device-token data access. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure.
 */
export interface DeviceTokenRepository {
  /** Registers (or re-assigns) a token to a student — a token identifies one device. */
  upsert(studentId: string, token: string, platform: DevicePlatform): Promise<void>;

  /** Removes a token the student owns (on logout). */
  remove(studentId: string, token: string): Promise<void>;

  /** All push tokens for a student (empty when none). */
  tokensFor(studentId: string): Promise<string[]>;

  /**
   * Deletes tokens the provider reported as permanently invalid — an uninstalled app or a reissued
   * token. Not scoped to a student on purpose: the provider knows the token is dead wherever it
   * happens to be registered.
   */
  removeMany(tokens: string[]): Promise<void>;
}
