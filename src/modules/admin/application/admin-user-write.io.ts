import { CourseYear } from '../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../profiles/domain/enums/gender.enum';

/**
 * Application input for admin-side account creation. Carries the plaintext `password` (the service
 * hashes it with argon2) plus the optional profile fields. Identifiers/profile fields are `null`
 * when the admin left them blank; at least one of `email` / `phoneNumber` is guaranteed by the DTO.
 */
export interface AdminCreateStudentInput {
  email: string | null;
  phoneNumber: string | null;
  password: string;
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

/** Application input for admin-side business-owner creation. See {@link AdminCreateStudentInput}. */
export interface AdminCreateOwnerInput {
  email: string | null;
  phoneNumber: string | null;
  password: string;
  firstName: string | null;
  lastName: string | null;
  gender: Gender | null;
  avatarUrl: string | null;
}
