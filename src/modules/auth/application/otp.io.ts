/**
 * Application-layer output contract for the OTP use-cases. `verify` returns void (it throws a
 * domain exception on any failure); the presentation layer maps success to `{ verified: true }`.
 */

/**
 * What a one-time code is for. Namespaces the Redis keys so the phone-verification (D1) and
 * password-reset (D5) codes / cooldowns / caps are fully independent per account type.
 */
export type OtpPurpose = 'phone_verify' | 'password_reset';

/** Returned by OtpService.request — identical whether the Dev or Eskiz provider sent the SMS. */
export interface OtpRequestResult {
  sent: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}
