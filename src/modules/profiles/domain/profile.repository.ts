import { Profile, ProfilePatch } from './entities/profile.entity';

/** Injection token for the `students` profile repository (bound to the Prisma impl in the module). */
export const STUDENT_PROFILE_REPOSITORY = Symbol('STUDENT_PROFILE_REPOSITORY');

/** Injection token for the `business_owners` profile repository (bound to the Prisma impl). */
export const BUSINESS_PROFILE_REPOSITORY = Symbol('BUSINESS_PROFILE_REPOSITORY');

/**
 * Profile data-access port. One implementation per account table (D6); the service picks the
 * matching implementation by the authenticated account type. The application layer depends on
 * this interface only — the Prisma implementations live in infrastructure.
 */
export interface ProfileRepository {
  findById(id: string): Promise<Profile | null>;
  /** Used to detect an already-taken phone number when it changes (→ 409). */
  findByPhone(phoneNumber: string): Promise<Profile | null>;
  /** Used to detect an already-taken username (students only; always `null` for business). */
  findByUsername(username: string): Promise<Profile | null>;
  update(id: string, patch: ProfilePatch): Promise<Profile>;
}
