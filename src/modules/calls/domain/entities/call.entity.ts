import { CallEndReason } from '../enums/call-end-reason.enum';
import { CallMedia } from '../enums/call-media.enum';
import { CallParty } from '../enums/call-party.enum';
import { CallStatus } from '../enums/call-status.enum';

/** A persisted call record. `durationMs` is derived, never stored — one source of truth. */
export interface Call {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: CallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  endReason: CallEndReason | null;
  endedBy: CallParty | null;
}

/**
 * Live call state, held in Redis for the duration of the call. Deliberately a subset of `Call`:
 * this is read on every ICE candidate, so it carries only what routing and authorization need.
 * Timestamps are ISO strings because a Redis hash stores strings.
 */
export interface CallState {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  /**
   * `true` ⇒ this pair had no completed call between them when the invite claimed the call. Fixed
   * for the call's whole lifetime — decided once in `CallsService.invite` and cached here so the
   * `call:ice` relay path (design §9.2) never re-runs `hasCompletedCallBetween` per candidate.
   */
  relayOnly: boolean;
}

/** Milliseconds of actual conversation; `0` when the call was never answered. */
export function durationMsOf(call: Pick<Call, 'answeredAt' | 'endedAt'>): number {
  if (call.answeredAt === null || call.endedAt === null) {
    return 0;
  }
  return call.endedAt.getTime() - call.answeredAt.getTime();
}

/** Which side of the call a student is on, or `null` when they are not a participant. */
export function partyOf(
  call: Pick<Call, 'callerId' | 'calleeId'>,
  studentId: string,
): CallParty | null {
  if (call.callerId === studentId) {
    return CallParty.CALLER;
  }
  if (call.calleeId === studentId) {
    return CallParty.CALLEE;
  }
  return null;
}
