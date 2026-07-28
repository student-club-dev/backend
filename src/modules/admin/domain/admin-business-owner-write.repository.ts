import { Gender } from '../../profiles/domain/enums/gender.enum';

/** Injection token for the admin business-owner write port (bound to the Prisma impl). */
export const ADMIN_BUSINESS_OWNER_WRITE_REPOSITORY = Symbol(
  'ADMIN_BUSINESS_OWNER_WRITE_REPOSITORY',
);

/**
 * Data required to create a `business_owners` row from the admin panel. `passwordHash` is already
 * hashed by the service (argon2); identifiers/profile fields are `null` when left blank.
 */
export interface AdminCreateOwnerData {
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  gender: Gender | null;
  avatarUrl: string | null;
}

/** Unscoped write access to the `business_owners` table for the admin panel. Prisma-backed. */
export interface AdminBusinessOwnerWriteRepository {
  /** Whether an owner already owns this email (uniqueness pre-check → 409). */
  existsByEmail(email: string): Promise<boolean>;

  /** Whether an owner already owns this phone number (uniqueness pre-check → 409). */
  existsByPhone(phoneNumber: string): Promise<boolean>;

  /** Inserts the owner and returns its new id (the service re-fetches the full record). */
  create(data: AdminCreateOwnerData): Promise<string>;
}
