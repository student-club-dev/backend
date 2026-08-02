import { Call } from './entities/call.entity';
import { CallEndReason } from './enums/call-end-reason.enum';
import { CallMedia } from './enums/call-media.enum';
import { CallParty } from './enums/call-party.enum';
import { CallStatus } from './enums/call-status.enum';

export const CALL_REPOSITORY = Symbol('CALL_REPOSITORY');

export interface CreateCallInput {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
}

export interface FinishCallInput {
  status: CallStatus;
  endReason: CallEndReason;
  endedBy: CallParty | null;
}

export interface CallPage {
  items: Call[];
  total: number;
}

export interface CallRepository {
  create(input: CreateCallInput): Promise<Call>;

  findById(callId: string): Promise<Call | null>;

  /** `CONNECTING → ACTIVE`, stamping `answeredAt`. Returns false if the row already moved on. */
  markActive(callId: string): Promise<boolean>;

  /**
   * Terminal write. MUST be a conditional `UPDATE ... WHERE status IN (live)` — never
   * read-modify-write: a `call:accept` at 44.9s and the ring timeout at 45s race, and the timeout
   * must not stamp MISSED over a call that was answered. Returns `null` when the row had already
   * reached a terminal status, which is what makes a repeated `call:end` idempotent.
   */
  finish(callId: string, input: FinishCallInput): Promise<Call | null>;

  /** Newest first. Filters `callerId = me OR calleeId = me` in SQL, never in a mapper. */
  listForStudent(studentId: string, page: number, size: number): Promise<CallPage>;

  /**
   * Has this pair ever completed a call? Drives the relay policy: an unfamiliar pair is forced
   * through TURN so neither side learns the other's IP address (design §9.2).
   */
  hasCompletedCallBetween(a: string, b: string): Promise<boolean>;

  /** Reconciliation backstop — closes calls Redis or BullMQ lost. Returns rows changed. */
  expireStale(startedBefore: Date): Promise<number>;
}
