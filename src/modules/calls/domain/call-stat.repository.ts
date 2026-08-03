import { CallStat } from './entities/call-stat.entity';
import { IceCandidateType } from './enums/ice-candidate-type.enum';

export const CALL_STAT_REPOSITORY = Symbol('CALL_STAT_REPOSITORY');

export interface RecordCallStatInput {
  callId: string;
  studentId: string;
  rttMs: number | null;
  packetsLost: number | null;
  packetsReceived: number | null;
  jitterMs: number | null;
  bytesSent: number | null;
  bytesReceived: number | null;
  candidateType: IceCandidateType;
}

export interface CallStatRepository {
  /**
   * MUST be an upsert on `(callId, studentId)`. A client posting stats has just finished a call and
   * may well be on a flaky connection — the retry that follows a timed-out request must not 500 on
   * the composite primary key. Last write wins, which is correct: a retry carries the same numbers,
   * and a genuine re-report after renegotiation carries better ones.
   */
  record(input: RecordCallStatInput): Promise<CallStat>;
}
