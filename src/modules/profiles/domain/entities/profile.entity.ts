import { CourseYear } from '../enums/course-year.enum';
import { Gender } from '../enums/gender.enum';
import { LastSeenVisibility } from '../enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../enums/phone-visibility.enum';
import { ProfileRole } from '../enums/profile-role.enum';

/**
 * The authenticated account's own profile. One shape for both account types (D6): the
 * university/course fields (universityId, universityEmail, birthYear, courseYear) and
 * `lastSeenVisibility` are always `null` for a business owner. `gender` is carried by both.
 * `role` is derived from the account type by the mapper.
 */
export interface Profile {
  id: string;
  role: ProfileRole;
  firstName: string | null;
  lastName: string | null;
  /** Unique handle for discovery (students only; always `null` for a business owner). */
  username: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  /** Short profile blurb (students only; always `null` for a business owner). */
  bio: string | null;
  gender: Gender | null;
  universityId: string | null;
  universityEmail: string | null;
  birthYear: number | null;
  courseYear: CourseYear | null;
  /** Students only — who may see this student's presence (C7). `null` for a business owner. */
  lastSeenVisibility: LastSeenVisibility | null;
  /** Students only — who may see this student's phone number. `null` for a business owner. */
  phoneVisibility: PhoneVisibility | null;
}

/**
 * A partial profile update. Only the present keys are written. `phoneVerified` is set by the
 * service (reset to false when `phoneNumber` changes) — it is never accepted from the client.
 */
export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  /** Already normalised by the service; `null` clears it. */
  bio?: string | null;
  gender?: Gender;
  universityId?: string;
  universityEmail?: string;
  birthYear?: number;
  courseYear?: CourseYear;
  lastSeenVisibility?: LastSeenVisibility;
  phoneVisibility?: PhoneVisibility;
  phoneVerified?: boolean;
}
