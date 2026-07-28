import { CourseYear } from '../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../profiles/domain/enums/gender.enum';
import { AdminStudent, AdminStudentSummary } from './entities/admin-student.entity';
import { AdminUserSort } from './enums/admin-user-sort.enum';

/** Injection token for the admin student read port (bound to the Prisma impl). */
export const ADMIN_STUDENT_READ_REPOSITORY = Symbol('ADMIN_STUDENT_READ_REPOSITORY');

/**
 * Filters for the admin student list. Every field narrows (AND); `null` means "no constraint".
 * `page`/`size` are 1-based and already defaulted by the presentation layer.
 */
export interface AdminStudentListFilter {
  /** Free text against firstName / lastName / username / phoneNumber / email (case-insensitive). */
  q: string | null;
  universityId: string | null;
  courseYear: CourseYear | null;
  gender: Gender | null;
  phoneVerified: boolean | null;
  createdFrom: Date | null;
  createdTo: Date | null;
  sort: AdminUserSort;
  page: number;
  size: number;
}

/** A page of admin student summaries plus the unpaginated total (the DTO derives `hasNext`). */
export interface AdminStudentPage {
  items: AdminStudentSummary[];
  total: number;
}

/** Read-only, unscoped access to every `students` row for the admin panel. Prisma-backed. */
export interface AdminStudentReadRepository {
  /** The filtered, paginated student list across all students. */
  list(filter: AdminStudentListFilter): Promise<AdminStudentPage>;

  /** The full student record (minus `passwordHash`), or `null` if none. */
  findById(id: string): Promise<AdminStudent | null>;
}
