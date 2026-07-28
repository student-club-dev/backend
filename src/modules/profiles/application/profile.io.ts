import { CourseYear } from '../domain/enums/course-year.enum';
import { Gender } from '../domain/enums/gender.enum';
import { LastSeenVisibility } from '../domain/enums/last-seen-visibility.enum';

/**
 * Fields the client may change on its own profile. Every field is optional (partial update);
 * an absent field is left unchanged. Normalised from UpdateProfileDto — the client's `role`
 * is intentionally dropped here (role is read-only, derived from the account type).
 */
export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
  gender?: Gender;
  universityId?: string;
  universityEmail?: string;
  birthYear?: number;
  courseYear?: CourseYear;
  lastSeenVisibility?: LastSeenVisibility;
  avatarUrl?: string;
}
