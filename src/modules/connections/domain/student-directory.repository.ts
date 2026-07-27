import { StudentSummary } from './entities/student-summary.entity';

/** Injection token for the student-directory read port (bound to the Prisma impl). */
export const STUDENT_DIRECTORY = Symbol('STUDENT_DIRECTORY');

/** A page of student summaries plus the unpaginated total. */
export interface StudentSummaryPage {
  items: StudentSummary[];
  total: number;
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
   * Search by username prefix OR full-name contains (case-insensitive), excluding `excludeIds`
   * (self + blocked). Newest students last is not required; order by relevance/name.
   */
  search(
    query: string,
    excludeIds: string[],
    page: number,
    size: number,
  ): Promise<StudentSummaryPage>;
}
