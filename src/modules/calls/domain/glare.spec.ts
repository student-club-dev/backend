import { CallStatus } from './enums/call-status.enum';
import { GlareCall, resolveGlare } from './glare';

const call = (
  callId: string,
  callerId: string,
  calleeId: string,
  status = CallStatus.RINGING,
): GlareCall => ({
  callId,
  callerId,
  calleeId,
  status,
});

describe('resolveGlare', () => {
  it('claims when both participants are free', () => {
    expect(resolveGlare(call('c5', 'A', 'B'), null, null)).toEqual({ kind: 'CLAIM' });
  });

  describe('true glare — the exact mirror pair, both still ringing', () => {
    // A→B and B→A crossed on the wire. The lexicographically smaller callId wins, so BOTH clients
    // reach the same conclusion without another round trip.
    it('preempts the mirror call when its id sorts higher', () => {
      const holder = call('c9', 'B', 'A');
      expect(resolveGlare(call('c1', 'A', 'B'), holder, holder)).toEqual({
        kind: 'PREEMPT',
        loserCallId: 'c9',
      });
    });

    it('yields when the mirror call id sorts lower', () => {
      const holder = call('c1', 'B', 'A');
      expect(resolveGlare(call('c9', 'A', 'B'), holder, holder)).toEqual({ kind: 'BUSY' });
    });
  });

  // ⚠️ A participant holding a key in another call is treated as occupied; both must be free to
  // claim a new call. Only the peer's key is held here.
  it('is busy when only the peer holds a key in an unrelated call', () => {
    const holder = call('c1', 'A', 'B');
    expect(resolveGlare(call('c0', 'C', 'A'), holder, null)).toEqual({ kind: 'BUSY' });
    expect(resolveGlare(call('c0', 'C', 'B'), null, holder)).toEqual({ kind: 'BUSY' });
  });

  // ⚠️ Without the mirror-pair condition any connected third party could tear down a call they are
  // not in, just by minting a smaller id. That is not glare, it is an attack.
  it('never preempts a same-direction call that already holds both keys', () => {
    const holder = call('c9', 'A', 'B'); // same direction, not a mirror
    expect(resolveGlare(call('c1', 'A', 'B'), holder, holder)).toEqual({ kind: 'BUSY' });
  });

  // ⚠️ Without the RINGING condition a new invite would tear down a conversation that was already
  // answered and is in progress.
  it.each([CallStatus.CONNECTING, CallStatus.ACTIVE])(
    'never preempts a mirror call that reached %s',
    (status) => {
      const holder = call('c9', 'B', 'A', status);
      expect(resolveGlare(call('c1', 'A', 'B'), holder, holder)).toEqual({ kind: 'BUSY' });
    },
  );

  // ⚠️ Without the same-call clause, both participants could be held by different calls, and a
  // relay could preempt when it should not be allowed.
  it('is busy when the caller key holds a mirror call but the callee key holds another', () => {
    expect(resolveGlare(call('c1', 'A', 'B'), call('c9', 'B', 'A'), call('c8', 'Y', 'B'))).toEqual({
      kind: 'BUSY',
    }); // PREEMPT here would mean acting on a stale or foreign pairing
  });

  it('is busy when the two keys are held by two different calls', () => {
    expect(resolveGlare(call('c1', 'A', 'B'), call('c2', 'A', 'X'), call('c3', 'Y', 'B'))).toEqual({
      kind: 'BUSY',
    });
  });

  it('is busy when only one participant is occupied', () => {
    expect(resolveGlare(call('c1', 'A', 'B'), call('c2', 'A', 'X'), null)).toEqual({
      kind: 'BUSY',
    });
    expect(resolveGlare(call('c1', 'A', 'B'), null, call('c2', 'Y', 'B'))).toEqual({
      kind: 'BUSY',
    });
  });

  it('is busy when call ids are equal (the tie case)', () => {
    expect(resolveGlare(call('c1', 'A', 'B'), call('c1', 'B', 'A'), call('c1', 'B', 'A'))).toEqual({
      kind: 'BUSY',
    });
  });
});
