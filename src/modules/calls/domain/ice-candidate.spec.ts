import { candidateType, isForwardableIceCandidate } from './ice-candidate';

const line = (typ: string): string => `candidate:1 1 UDP 2122260223 10.0.0.1 5000 typ ${typ}`;

describe('candidateType', () => {
  it('extracts the typ token', () => {
    expect(candidateType(line('host'))).toBe('host');
    expect(candidateType(line('srflx'))).toBe('srflx');
    expect(candidateType(line('prflx'))).toBe('prflx');
    expect(candidateType(line('relay'))).toBe('relay');
  });

  it('returns null for a line with no typ token', () => {
    expect(candidateType('not a real candidate line')).toBeNull();
  });
});

describe('isForwardableIceCandidate', () => {
  it('drops a host candidate when the call is relayOnly', () => {
    expect(isForwardableIceCandidate(line('host'), true)).toBe(false);
  });

  it('drops an srflx/prflx candidate when the call is relayOnly', () => {
    expect(isForwardableIceCandidate(line('srflx'), true)).toBe(false);
    expect(isForwardableIceCandidate(line('prflx'), true)).toBe(false);
  });

  it('forwards a host candidate when the call is not relayOnly', () => {
    expect(isForwardableIceCandidate(line('host'), false)).toBe(true);
  });

  it('always forwards a relay candidate, relayOnly or not', () => {
    expect(isForwardableIceCandidate(line('relay'), true)).toBe(true);
    expect(isForwardableIceCandidate(line('relay'), false)).toBe(true);
  });

  // The end-of-candidates signal — swallowing it would stall the peer's ICE gathering forever.
  it('always forwards the empty end-of-candidates string, relayOnly or not', () => {
    expect(isForwardableIceCandidate('', true)).toBe(true);
    expect(isForwardableIceCandidate('', false)).toBe(true);
  });

  // Fail closed: a privacy control must not forward on doubt.
  it('drops an unparseable candidate when relayOnly', () => {
    expect(isForwardableIceCandidate('garbage', true)).toBe(false);
  });

  it('forwards an unparseable candidate when not relayOnly', () => {
    expect(isForwardableIceCandidate('garbage', false)).toBe(true);
  });
});
