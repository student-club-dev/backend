export enum CallStatus {
  RINGING = 'RINGING',
  /** `accept` arrived, media not yet connected. Guards the 30s connect timeout (design §5.1). */
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  MISSED = 'MISSED',
  DECLINED = 'DECLINED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}
