export const CALL_STUDENT_DIRECTORY = Symbol('CALL_STUDENT_DIRECTORY');

/** What `call:incoming` shows on the callee's ringing screen. */
export interface CallerSummary {
  id: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface StudentDirectoryRepository {
  summary(studentId: string): Promise<CallerSummary | null>;
}
