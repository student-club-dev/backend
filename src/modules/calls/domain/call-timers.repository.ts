export const CALL_TIMERS = Symbol('CALL_TIMERS');

export type CallTimerKind = 'ring' | 'connect' | 'max' | 'grace';

export interface CallTimersRepository {
  /** Job ids are deterministic (`ring:{callId}`) so they can be cancelled by name. */
  schedule(kind: CallTimerKind, callId: string, delayMs: number, studentId?: string): Promise<void>;
  cancel(kind: CallTimerKind, callId: string, studentId?: string): Promise<void>;
  /** Called on every terminal transition — leaving 4-hour jobs behind fills Redis. */
  cancelAll(callId: string): Promise<void>;
}
