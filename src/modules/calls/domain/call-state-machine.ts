import { CallEndReason } from './enums/call-end-reason.enum';
import { CallStatus } from './enums/call-status.enum';

/** Statuses a call can still move out of — also the predicate the reconciliation sweep uses. */
export const LIVE_STATUSES = [
  CallStatus.RINGING,
  CallStatus.CONNECTING,
  CallStatus.ACTIVE,
] as const;

const ALLOWED: Readonly<Record<CallStatus, readonly CallStatus[]>> = {
  [CallStatus.RINGING]: [
    CallStatus.CONNECTING,
    CallStatus.MISSED,
    CallStatus.DECLINED,
    CallStatus.CANCELED,
    CallStatus.FAILED,
  ],
  [CallStatus.CONNECTING]: [CallStatus.ACTIVE, CallStatus.FAILED, CallStatus.ENDED],
  [CallStatus.ACTIVE]: [CallStatus.ENDED, CallStatus.FAILED],
  // Terminal — a repeated `call:end` from a retrying client is ignored, not rejected.
  [CallStatus.ENDED]: [],
  [CallStatus.MISSED]: [],
  [CallStatus.DECLINED]: [],
  [CallStatus.FAILED]: [],
  [CallStatus.CANCELED]: [],
};

/**
 * Which `(status, endReason)` pairs may be written. Three names appear in both enums (DECLINED, FAILED,
 * CANCELED), so without this matrix nothing prevents `(ENDED, DECLINED)` — a row that
 * is meaningless and, once written, unrecoverable in aggregate.
 */
const OUTCOMES: Readonly<Partial<Record<CallStatus, readonly CallEndReason[]>>> = {
  [CallStatus.ENDED]: [CallEndReason.HANGUP, CallEndReason.TIMEOUT],
  [CallStatus.MISSED]: [CallEndReason.TIMEOUT],
  [CallStatus.DECLINED]: [CallEndReason.DECLINED, CallEndReason.BUSY],
  [CallStatus.CANCELED]: [CallEndReason.CANCELED],
  [CallStatus.FAILED]: [CallEndReason.FAILED, CallEndReason.UNAUTHORIZED],
};

export function isTerminal(status: CallStatus): boolean {
  return ALLOWED[status].length === 0;
}

export function canTransition(from: CallStatus, to: CallStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isValidOutcome(status: CallStatus, reason: CallEndReason): boolean {
  return OUTCOMES[status]?.includes(reason) ?? false;
}
