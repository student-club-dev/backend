import { IceCandidateType } from '../enums/ice-candidate-type.enum';

/**
 * One participant's view of how a call actually performed, reported by their client once the call
 * is over. Two rows per call at most — the two ends see different numbers, and a call where one
 * side relayed and the other did not is a real and interesting case, so they are never merged.
 *
 * ⚠️ Every field here is **client-reported and therefore untrusted**. A modified client can send
 * whatever it likes. Ranges are validated at the DTO, but that only bounds the damage: these
 * numbers describe the fleet, they must never be the sole basis for a spend or enforcement
 * decision. The TURN provider's own usage API is the authority on how much bandwidth was used;
 * this table explains *why*.
 */
export interface CallStat {
  callId: string;
  studentId: string;
  /** Round-trip time on the selected candidate pair. */
  rttMs: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  jitterMs: number | null;
  /**
   * Bytes this participant sent and received over the call. `BigInt` in the database because a
   * long video call clears Int32; surfaced as `number` here since byte counts stay far below 2^53.
   */
  bytesSent: number | null;
  bytesReceived: number | null;
  candidateType: IceCandidateType;
  createdAt: Date;
}
