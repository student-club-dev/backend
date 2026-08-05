/** Injection token for the send-once ledger. */
export const NOTIFICATION_DEDUP_REPOSITORY = Symbol('NOTIFICATION_DEDUP_REPOSITORY');

/**
 * Keys for the frequency rules (push catalogue §5). Built here rather than at the call sites so a
 * typo cannot quietly turn "once ever" into "every ten minutes" — two keys that disagree by one
 * character are two different promises.
 */
export const DedupKey = {
  /** §5.2 — an expiry warning goes out once in a student listing's life. */
  studentListingExpiry: (listingId: string): string => `expiry:student-listing:${listingId}`,

  /**
   * §5.2 — once per saved discount per student. Keyed on both because the same listing expiring
   * is a separate reminder for every student who saved it.
   */
  discountExpiry: (listingId: string, studentId: string): string =>
    `expiry:discount:${listingId}:${studentId}`,

  /** §5.1 — at most one job digest per student per day. The date is the Tashkent calendar day. */
  jobDigest: (studentId: string, day: string): string => `digest:job:${studentId}:${day}`,
} as const;

/**
 * "Has this exact notification already gone out?"
 *
 * Deliberately a database table rather than a cache: §5.2 promises a reminder is sent **once in a
 * listing's lifetime**, and a store that can be flushed turns that into once per deploy. The
 * expiry reminder is the notification a user is most likely to describe as spam if it repeats.
 */
export interface NotificationDedupRepository {
  /**
   * Claims `key`, returning `true` only for the caller that got there first.
   *
   * Atomic — implemented as an insert against a primary key, so two replicas racing on the same
   * listing produce exactly one winner without either taking a lock.
   */
  claim(key: string): Promise<boolean>;

  /** Drops entries older than `before`, so the ledger does not grow forever. */
  purgeOlderThan(before: Date): Promise<number>;
}
