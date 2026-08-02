import { CallState } from './entities/call.entity';
import { CallStatus } from './enums/call-status.enum';
import { GlareDecision } from './glare';

export const CALL_STATE_REPOSITORY = Symbol('CALL_STATE_REPOSITORY');

export interface CallStateRepository {
  /**
   * Atomically claim both participants' busy keys and write the live state. The whole decision runs
   * inside one Lua script so two simultaneous invites cannot both succeed — see `glare.ts` for the
   * rule this transcribes. On `PREEMPT` the losing call's keys have already been handed over; the
   * caller must close that call with BUSY.
   */
  claim(state: CallState): Promise<GlareDecision>;

  get(callId: string): Promise<CallState | null>;

  /**
   * Compare-and-set on status. Returns false when the call was not in one of `from` — this is what
   * makes "first accept wins" work across devices and instances.
   */
  compareAndSetStatus(
    callId: string,
    from: readonly CallStatus[],
    to: CallStatus,
    answeredAt?: string,
  ): Promise<boolean>;

  /** Drop the live state and both busy keys. Safe to call twice. */
  release(callId: string): Promise<void>;

  /** Refresh the participant-presence marker the disconnect grace timer reads. */
  markPresent(callId: string, studentId: string): Promise<void>;

  isPresent(callId: string, studentId: string): Promise<boolean>;

  clearPresent(callId: string, studentId: string): Promise<void>;
}
