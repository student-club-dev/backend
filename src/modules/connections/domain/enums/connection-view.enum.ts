/**
 * The relationship between the viewer and another student, from the viewer's perspective (C11).
 * Lets the client render the right button (Connect / Pending / Respond / Message).
 */
export enum ConnectionView {
  /** No edge (or a prior DECLINED one). */
  NONE = 'NONE',
  /** The viewer sent a request that is still pending. */
  PENDING_OUT = 'PENDING_OUT',
  /** The other student sent the viewer a request that is still pending. */
  PENDING_IN = 'PENDING_IN',
  /** Accepted — they are connected. */
  CONNECTED = 'CONNECTED',
}
