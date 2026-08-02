/**
 * `/calls` wire protocol. 15 events from the source spec §12.1 plus `call:connected` (design §5.1)
 * plus `call:auth` (design §6.4, gateway review round 2) — 17 total.
 */
export const CALL_EVENT = {
  INVITE: 'call:invite',
  INCOMING: 'call:incoming',
  RINGING: 'call:ringing',
  ACCEPT: 'call:accept',
  ACCEPTED: 'call:accepted',
  CONNECTED: 'call:connected',
  DECLINE: 'call:decline',
  DECLINED: 'call:declined',
  CANCEL: 'call:cancel',
  CANCELED: 'call:canceled',
  ICE: 'call:ice',
  END: 'call:end',
  ENDED: 'call:ended',
  MEDIA_STATE: 'call:media-state',
  RENEGOTIATE: 'call:renegotiate',
  TAKEN: 'call:taken',
  AUTH: 'call:auth',
} as const;
