import { Redemption, StudentBrief } from './entities/redemption.entity';

/** Injection token for the redemption repository port (bound to the Prisma impl in the module). */
export const REDEMPTION_REPOSITORY = Symbol('REDEMPTION_REPOSITORY');

/** Fields for a new PENDING redemption. `code` is a server-generated single-use token. */
export interface CreatePendingData {
  listingId: string;
  studentId: string;
  code: string;
  expiresAt: Date;
}

/** A confirmed redemption plus the redeeming student, for the owner's history list. */
export interface RedemptionView {
  redemption: Redemption;
  student: StudentBrief;
}

/** A page of redemption views plus the unpaginated total. */
export interface RedemptionPage {
  items: RedemptionView[];
  total: number;
}

/**
 * Redemption data-access port. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure.
 */
export interface RedemptionRepository {
  findByCode(code: string): Promise<Redemption | null>;

  /** An existing PENDING code for the pair that has not yet expired (reused instead of re-issuing). */
  findUnexpiredPending(studentId: string, listingId: string, now: Date): Promise<Redemption | null>;

  createPending(data: CreatePendingData): Promise<Redemption>;

  /**
   * PENDING → CONFIRMED (guarded on the current PENDING status) plus a `usedCount` increment on the
   * listing, in one transaction. Returns the confirmed redemption, or `null` when it was no longer
   * PENDING (a concurrent confirm won) — the service maps that to ALREADY_REDEEMED.
   */
  confirm(
    id: string,
    branchId: string | null,
    amount: number | null,
    redeemedAt: Date,
  ): Promise<Redemption | null>;

  /** Count of CONFIRMED redemptions for a listing, optionally scoped to a student and/or a window. */
  countConfirmed(listingId: string, studentId: string | null, since: Date | null): Promise<number>;

  findStudentBrief(studentId: string): Promise<StudentBrief | null>;

  /** Confirmed redemptions of a listing (with the student), newest first, paginated. */
  listConfirmedByListing(listingId: string, page: number, size: number): Promise<RedemptionPage>;
}
