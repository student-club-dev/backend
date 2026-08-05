/** Injection token for the job-matching source. */
export const JOB_DIGEST_REPOSITORY = Symbol('JOB_DIGEST_REPOSITORY');

/** One student's worth of new matching jobs — already aggregated, ready to become one push. */
export interface JobDigestMatch {
  studentId: string;
  /** How many matched in the window. The push says "1" or "N" and nothing in between (§5.1). */
  count: number;
  /** The newest of them — the one a single-match digest opens. */
  firstListingId: string;
  firstTitle: string;
  /**
   * Pay in so'm, as text. Text rather than a number because the column is a `BigInt` of minor
   * units and this value is only ever formatted, never arithmetic'd — carrying it as a JS number
   * would silently lose precision above 2^53 for no benefit. Null when the listing named no price.
   */
  firstPrice: string | null;
  /** The employer, for a listing that gave no price. Null when it gave neither. */
  firstCompany: string | null;
}

/**
 * "Which students should hear about the jobs posted since `since`?" (§3.3 №9).
 *
 * Aggregated in SQL rather than by looping students in application code, because the naive shape —
 * one query per student — is a full table scan per person every morning. This returns one row per
 * student who has something to hear about, and nothing for everyone else.
 */
export interface JobDigestRepository {
  findMatchesSince(since: Date, limit: number): Promise<JobDigestMatch[]>;
}
