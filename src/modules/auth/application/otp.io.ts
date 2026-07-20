/**
 * Application-layer output contract for the OTP use-cases. `verify` returns void (it throws a
 * domain exception on any failure); the presentation layer maps success to `{ verified: true }`.
 */

/** Returned by OtpService.request — identical whether the Dev or Eskiz provider sent the SMS. */
export interface OtpRequestResult {
  sent: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}
