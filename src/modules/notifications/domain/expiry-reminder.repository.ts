/** Injection token for the expiry-reminder source. */
export const EXPIRY_REMINDER_REPOSITORY = Symbol('EXPIRY_REMINDER_REPOSITORY');

/** A student listing about to close, and who to tell (§3.3 №8). */
export interface ExpiringStudentListing {
  listingId: string;
  ownerId: string;
  title: string;
  validTo: Date;
}

/** A saved business discount about to end, and the student who saved it (§3.3 №10). */
export interface ExpiringSavedDiscount {
  listingId: string;
  studentId: string;
  merchant: string;
  discount: string;
  validTo: Date;
}

/**
 * The two "about to expire" queries behind §3.3 №8 and №10.
 *
 * They live together because they answer the same question for the same cron, and separately from
 * the listings modules because nothing here writes: it is a read across `student_listings` and
 * `listings ⋈ student_favorites` on behalf of the notification catalogue, and adding a
 * notification-shaped method to each of those modules would spread one feature over three.
 */
export interface ExpiryReminderRepository {
  /** ACTIVE student listings whose `validTo` falls inside the window, with their owner. */
  findExpiringStudentListings(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<ExpiringStudentListing[]>;

  /**
   * Favourited discounts whose `validTo` falls inside the window — one row per (listing, student),
   * because the same listing expiring is a separate reminder for everyone who saved it.
   */
  findExpiringSavedDiscounts(from: Date, to: Date, limit: number): Promise<ExpiringSavedDiscount[]>;
}
