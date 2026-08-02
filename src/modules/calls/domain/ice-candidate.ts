/** Matches the `typ <token>` part of an ICE candidate SDP line, e.g. `... typ host ...`. */
const TYP_PATTERN = /(?:^|\s)typ\s+(\S+)/;

/**
 * The `typ` token of an ICE candidate SDP line (`host`, `srflx`, `prflx`, `relay`, ...), or `null`
 * when the line does not contain one — a candidate this codebase cannot make sense of.
 */
export function candidateType(candidateLine: string): string | null {
  return TYP_PATTERN.exec(candidateLine)?.[1] ?? null;
}

/**
 * §9.2: whether an ICE candidate may be forwarded to the peer.
 *
 * When a call is NOT `relayOnly`, everything is forwarded — this only ever narrows a relay-only
 * call. When it IS `relayOnly`, only a `relay` candidate passes; a `host`/`srflx`/`prflx` candidate
 * (or a line this cannot parse — fails closed, since this is a privacy control) is dropped rather
 * than reaching a stranger who has never completed a call with the sender (design §9.2,
 * `hasCompletedCallBetween`).
 *
 * The empty string is the end-of-candidates signal, not a candidate to parse — it always passes, or
 * a relay-only peer's ICE gathering would never be told it finished.
 */
export function isForwardableIceCandidate(candidateLine: string, relayOnly: boolean): boolean {
  if (candidateLine === '' || !relayOnly) {
    return true;
  }
  return candidateType(candidateLine) === 'relay';
}
