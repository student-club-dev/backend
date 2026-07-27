import { RedemptionStatus } from '../enums/redemption-status.enum';

/** A redemption record — a student's intent (`PENDING` code) that a cashier confirms. */
export interface Redemption {
  id: string;
  listingId: string;
  studentId: string;
  branchId: string | null;
  code: string;
  status: RedemptionStatus;
  /** Whole soums applied at the till (nullable — the cashier may not enter it). */
  amount: number | null;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
}

/** The student fields a cashier sees when verifying a code, and in the redemptions history. */
export interface StudentBrief {
  id: string;
  fullName: string | null;
  username: string | null;
  universityId: string | null;
}
