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

  /**
   * Bans the owner: status=BANNED, bannedAt=now, banReason=reason, and revokes ALL of the owner's
   * refresh tokens (force logout) — atomically. Re-banning updates the reason.
   */
  ban(id: string, reason: string): Promise<void>;

  /** Un-bans the owner: status=ACTIVE, clears bannedAt/banReason. */
  unban(id: string): Promise<void>;

  /**
   * Closes the owner's account (admin-panel 15-deletion.md §4) and takes their shopfront down with
   * it: businesses and their listings are archived in the same transaction.
   *
   * That second half is the point. An owner who cannot log in but whose discounts are still in the
   * feed sends students to a counter where nobody will honour them — the failure lands on the
   * student, who did nothing wrong and has no way to know.
   *
   * Soft, like the student one, and for the same reason: `Report` and `Redemption` history is not
   * this account's alone to erase. One-way — there is no restore.
   */
  softDelete(id: string, reason: string | null): Promise<void>;
}
