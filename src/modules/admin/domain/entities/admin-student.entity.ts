import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { LastSeenVisibility } from '../../../profiles/domain/enums/last-seen-visibility.enum';
import { AdminUserStatus } from '../enums/admin-user-status.enum';

/**
 * A student row as the admin list shows it — the fields the panel renders per row. Pure domain
 * type; the infrastructure layer maps it from the Prisma row (never selecting `passwordHash`).
 */
export interface AdminStudentSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  phoneNumber: string | null;
  email: string | null;
  universityId: string | null;
  courseYear: CourseYear | null;
  status: AdminUserStatus;
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date;
}

/**
 * The full student record for the admin detail view — every `students` column EXCEPT
 * `passwordHash`, which is never read or exposed.
 */
export interface AdminStudent {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  username: string | null;
  gender: Gender | null;
  universityId: string | null;
  universityEmail: string | null;
  birthYear: number | null;
  courseYear: CourseYear | null;
  lastSeenAt: Date | null;
  lastSeenVisibility: LastSeenVisibility;
  status: AdminUserStatus;
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
