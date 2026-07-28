import { CourseYear } from '../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../profiles/domain/enums/gender.enum';
import { StudentSummary } from './entities/student-summary.entity';

/** Injection token for the student-directory read port (bound to the Prisma impl). */
export const STUDENT_DIRECTORY = Symbol('STUDENT_DIRECTORY');

/** A page of student summaries plus the unpaginated total. */
export interface StudentSummaryPage {
  items: StudentSummary[];
  total: number;
}

/** Result order for the student list. */
export enum StudentSort {
  /** Newest accounts first — the default. */
  RECENT = 'RECENT',
  /** Alphabetical by username, then first name. */
  NAME = 'NAME',
}

/**
 * Filters for the student list (`GET /v1/students`). Every field is a narrowing AND; the array
 * fields are ORs within themselves. An empty array means "no constraint on this column".
 */
export interface StudentListFilter {
  /** Free text: username prefix OR firstName/lastName contains (case-insensitive). */
  q: string | null;
  universityIds: string[];
  genders: Gender[];
  courseYears: CourseYear[];
  birthYearFrom: number | null;
  birthYearTo: number | null;
  sort: StudentSort;
}

/**
 * Read-only access to the `students` table for discovery + summary hydration. Kept a separate port
 * from auth/profiles so connections depends only on the shape it needs.
 */
export interface StudentDirectoryRepository {
  /** Whether a student with this id exists. */
  exists(studentId: string): Promise<boolean>;

  /** Summary for one student, or `null`. */
  findSummary(studentId: string): Promise<StudentSummary | null>;

  /** Summaries for many ids (order not guaranteed; caller re-orders if needed). */
  findSummaries(ids: string[]): Promise<StudentSummary[]>;

  /**
   * The filtered, paginated student list. `excludeIds` drops rows (self + blocked); `restrictToIds`,
   * when non-null, keeps only those rows — that is how the caller narrows by `connectionStatus`.
   * A non-null but empty `restrictToIds` therefore yields an empty page.
   */
  list(
    filter: StudentListFilter,
    excludeIds: string[],
    restrictToIds: string[] | null,
    page: number,
    size: number,
  ): Promise<StudentSummaryPage>;
}
