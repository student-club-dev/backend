/**
 * Mirrors the Prisma `IceCandidateType` enum — the domain does not import Prisma.
 *
 * This is the type of the *selected* candidate pair, not "a candidate that was gathered". Every
 * call gathers relay candidates; only some end up using them, and the whole point of collecting
 * this is to learn which. `RELAY` here means the media actually went through TURN and cost us
 * bandwidth.
 */
export enum IceCandidateType {
  /** Both peers on the same network — no NAT traversal was needed at all. */
  HOST = 'HOST',
  /** Server-reflexive: STUN was enough, media flows peer-to-peer. Costs us nothing. */
  SRFLX = 'SRFLX',
  /** Relayed through TURN. This is the only value that consumes relay bandwidth. */
  RELAY = 'RELAY',
}
