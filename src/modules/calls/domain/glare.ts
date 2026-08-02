import { CallStatus } from './enums/call-status.enum';

/** The subset of a call the glare rule needs — both the incoming invite and any current holder. */
export interface GlareCall {
  callId: string;
  callerId: string;
  calleeId: string;
  /** Only used in holders to check if the call is still RINGING; the incoming call's status is never read. */
  status: CallStatus;
}

export type GlareDecision =
  { kind: 'CLAIM' } | { kind: 'PREEMPT'; loserCallId: string } | { kind: 'BUSY' };

/**
 * Decides what an incoming `call:invite` may do when one or both participants are already marked
 * busy. Kept as a pure function so it can be unit-tested without Redis: the Lua script in
 * `call-state.redis.repository.ts` is a direct transcription of these three branches, and the two
 * must stay in step.
 *
 * "Glare" is the narrow case of A→B and B→A crossing on the wire. It is resolved by the
 * lexicographically smaller `callId` — a deterministic rule, so both clients agree without another
 * round trip (design §5.3). Two conditions make that rule safe:
 *
 *  - **mirror pair** — otherwise any connected third party could tear down a call by minting a
 *    smaller id;
 *  - **still RINGING** — otherwise a fresh invite would cut off a conversation already in progress.
 *
 * Everything else is BUSY.
 *
 * Precondition: `incoming.callerId !== incoming.calleeId` (self-invites are rejected upstream).
 */
export function resolveGlare(
  incoming: GlareCall,
  callerHolder: GlareCall | null,
  calleeHolder: GlareCall | null,
): GlareDecision {
  if (callerHolder === null && calleeHolder === null) {
    return { kind: 'CLAIM' };
  }
  // A true mirror call occupies BOTH keys, because its caller is our callee and vice versa.
  if (
    callerHolder === null ||
    calleeHolder === null ||
    callerHolder.callId !== calleeHolder.callId
  ) {
    return { kind: 'BUSY' };
  }
  const holder = callerHolder;
  const isMirror = holder.callerId === incoming.calleeId && holder.calleeId === incoming.callerId;
  if (!isMirror || holder.status !== CallStatus.RINGING || holder.callId <= incoming.callId) {
    return { kind: 'BUSY' };
  }
  return { kind: 'PREEMPT', loserCallId: holder.callId };
}
