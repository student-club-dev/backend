import { CourseYear } from '../enums/course-year.enum';
import { Gender } from '../enums/gender.enum';
import { ProfileRole } from '../enums/profile-role.enum';

/**
 * The authenticated account's own profile. One shape for both account types (D6): the
 * university/course fields (universityId, universityEmail, birthYear, courseYear) are
 * always `null` for a business owner. `gender` is carried by both. `role` is derived from
 * the account type by the mapper.
 */
export interface Profile {
  id: string;
  role: ProfileRole;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  gender: Gender | null;
  universityId: string | null;
  universityEmail: string | null;
  birthYear: number | null;
  courseYear: CourseYear | null;
}

/**
 * A partial profile update. Only the present keys are written. `phoneVerified` is set by the
 * service (reset to false when `phoneNumber` changes) — it is never accepted from the client.
 */
export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  gender?: Gender;
  universityId?: string;
  universityEmail?: string;
  birthYear?: number;
  courseYear?: CourseYear;
  phoneVerified?: boolean;
}
