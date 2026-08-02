import { CallEndReason } from './enums/call-end-reason.enum';
import { CallStatus } from './enums/call-status.enum';
import { canTransition, isTerminal, isValidOutcome, LIVE_STATUSES } from './call-state-machine';

describe('call state machine', () => {
  describe('isTerminal', () => {
    it.each([
      CallStatus.ENDED,
      CallStatus.MISSED,
      CallStatus.DECLINED,
      CallStatus.FAILED,
      CallStatus.CANCELED,
    ])('%s is terminal', (status) => expect(isTerminal(status)).toBe(true));

    it.each([CallStatus.RINGING, CallStatus.CONNECTING, CallStatus.ACTIVE])(
      '%s is not terminal',
      (status) => expect(isTerminal(status)).toBe(false),
    );
  });

  describe('canTransition', () => {
    it('allows the happy path', () => {
      expect(canTransition(CallStatus.RINGING, CallStatus.CONNECTING)).toBe(true);
      expect(canTransition(CallStatus.CONNECTING, CallStatus.ACTIVE)).toBe(true);
      expect(canTransition(CallStatus.ACTIVE, CallStatus.ENDED)).toBe(true);
    });

    // User can hang up after accepting but before media connects.
    it('allows hanging up between accept and media connecting', () => {
      expect(canTransition(CallStatus.CONNECTING, CallStatus.ENDED)).toBe(true);
    });

    it('allows every live status to fail', () => {
      for (const from of LIVE_STATUSES) {
        expect(canTransition(from, CallStatus.FAILED)).toBe(true);
      }
    });

    it('allows ringing to be missed, declined or canceled', () => {
      expect(canTransition(CallStatus.RINGING, CallStatus.MISSED)).toBe(true);
      expect(canTransition(CallStatus.RINGING, CallStatus.DECLINED)).toBe(true);
      expect(canTransition(CallStatus.RINGING, CallStatus.CANCELED)).toBe(true);
    });

    // A repeated `call:end` is normal client behaviour — it must be ignored, not rejected loudly.
    it('never leaves a terminal status', () => {
      for (const from of [
        CallStatus.ENDED,
        CallStatus.MISSED,
        CallStatus.DECLINED,
        CallStatus.FAILED,
        CallStatus.CANCELED,
      ]) {
        for (const to of Object.values(CallStatus)) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    });

    it('rejects skipping CONNECTING', () => {
      expect(canTransition(CallStatus.RINGING, CallStatus.ACTIVE)).toBe(false);
    });

    it('rejects going backwards', () => {
      expect(canTransition(CallStatus.ACTIVE, CallStatus.RINGING)).toBe(false);
      expect(canTransition(CallStatus.CONNECTING, CallStatus.RINGING)).toBe(false);
    });

    // A call that was never answered cannot be "missed" after the callee picked up.
    it('rejects MISSED and DECLINED once the call moved past RINGING', () => {
      expect(canTransition(CallStatus.CONNECTING, CallStatus.MISSED)).toBe(false);
      expect(canTransition(CallStatus.ACTIVE, CallStatus.DECLINED)).toBe(false);
    });
  });

  describe('isValidOutcome', () => {
    it('accepts the pairs the product produces', () => {
      expect(isValidOutcome(CallStatus.ENDED, CallEndReason.HANGUP)).toBe(true);
      expect(isValidOutcome(CallStatus.ENDED, CallEndReason.TIMEOUT)).toBe(true);
      expect(isValidOutcome(CallStatus.MISSED, CallEndReason.TIMEOUT)).toBe(true);
      expect(isValidOutcome(CallStatus.DECLINED, CallEndReason.DECLINED)).toBe(true);
      expect(isValidOutcome(CallStatus.DECLINED, CallEndReason.BUSY)).toBe(true);
      expect(isValidOutcome(CallStatus.CANCELED, CallEndReason.CANCELED)).toBe(true);
      expect(isValidOutcome(CallStatus.FAILED, CallEndReason.FAILED)).toBe(true);
      expect(isValidOutcome(CallStatus.FAILED, CallEndReason.UNAUTHORIZED)).toBe(true);
    });

    // Three names appear in both enums (DECLINED, FAILED, CANCELED); nothing else stops a contradictory pair being written,
    // and a year of analytics on contradictory rows cannot be recovered.
    it('rejects contradictory pairs', () => {
      expect(isValidOutcome(CallStatus.ENDED, CallEndReason.DECLINED)).toBe(false);
      expect(isValidOutcome(CallStatus.MISSED, CallEndReason.HANGUP)).toBe(false);
      expect(isValidOutcome(CallStatus.CANCELED, CallEndReason.HANGUP)).toBe(false);
      expect(isValidOutcome(CallStatus.DECLINED, CallEndReason.TIMEOUT)).toBe(false);
    });

    it('rejects a live status as an outcome', () => {
      expect(isValidOutcome(CallStatus.ACTIVE, CallEndReason.HANGUP)).toBe(false);
    });
  });
});
