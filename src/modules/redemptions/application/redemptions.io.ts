import { DiscountType } from '../../listings/domain/enums/discount-type.enum';
import { StudentBrief } from '../domain/entities/redemption.entity';

/** `start` result — the code the app renders (as QR or text) plus when it expires. */
export interface StartResult {
  code: string;
  expiresAt: Date;
}

/** Why a code failed verification (soft — returned in the 200 verify body). */
export type InvalidReason = 'INVALID_CODE' | 'ALREADY_REDEEMED' | 'EXPIRED' | 'LIMIT_REACHED';

/** The discount the cashier applies at the till. */
export interface DiscountBrief {
  type: DiscountType;
  value: number;
  finalPrice: number;
  originalPrice: number;
}

/** `verify` result — the cashier sees who is redeeming and the discount, or why the code is invalid. */
export interface VerifyResult {
  isValid: boolean;
  invalidReason: InvalidReason | null;
  student: StudentBrief | null;
  discount: DiscountBrief | null;
}

/** Normalised `confirm` payload. */
export interface ConfirmInput {
  code: string;
  branchId: string | null;
  amount: number | null;
}
