import { CourseYear } from '../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../profiles/domain/enums/gender.enum';

/** Injection token for the admin student write port (bound to the Prisma impl). */
export const ADMIN_STUDENT_WRITE_REPOSITORY = Symbol('ADMIN_STUDENT_WRITE_REPOSITORY');

/**
 * Data required to create a `students` row from the admin panel. `passwordHash` is already hashed
 * by the service (argon2); identifiers/profile fields are `null` when the admin left them blank.
 */
export interface AdminCreateStudentData {
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  gender: Gender | null;
  universityId: string | null;
  universityEmail: string | null;
  birthYear: number | null;
  courseYear: CourseYear | null;
  avatarUrl: string | null;
}

/** Unscoped write access to the `students` table for the admin panel. Prisma-backed. */
export interface AdminStudentWriteRepository {
  /** Whether a student already owns this email (uniqueness pre-check → 409). */
  existsByEmail(email: string): Promise<boolean>;

  /** Whether a student already owns this phone number (uniqueness pre-check → 409). */
  existsByPhone(phoneNumber: string): Promise<boolean>;

  /** Whether a student already owns this username (uniqueness pre-check → 409). */
  existsByUsername(username: string): Promise<boolean>;

  /** Inserts the student and returns its new id (the service re-fetches the full record). */
  create(data: AdminCreateStudentData): Promise<string>;

  /**
   * Bans the student: status=BANNED, bannedAt=now, banReason=reason, and revokes ALL of the
   * student's refresh tokens (force logout) — atomically. Re-banning updates the reason.
   */
  ban(id: string, reason: string): Promise<void>;

  /** Un-bans the student: status=ACTIVE, clears bannedAt/banReason. */
  unban(id: string): Promise<void>;

  /**
   * Closes the account (admin-panel 15-deletion.md §3): `status = DELETED`, sessions revoked,
   * device tokens removed and the student's own listings archived — all in one transaction.
   *
   * ⚠️ Deliberately NOT a row delete. Twenty-one tables cascade from `students`, and two of them
   * are not this person's to erase: `Message` lives inside the OTHER party's conversation, and
   * `Report` is the record of what they were accused of. A hard delete would quietly take a
   * stranger's chat history and the evidence against a rule-breaker with it.
   *
   * One-way: there is no `restore`. The product decided against it, so the UI warns instead.
   */
  softDelete(id: string, reason: string | null): Promise<void>;
}
