/**
 * Application-layer output contract for the OTP use-cases. `verify` returns void (it throws a
 * domain exception on any failure); the presentation layer maps success to `{ verified: true }`.
 */

/**
 * What a one-time code is for. Namespaces the Redis keys so each flow's codes, cooldowns and caps
 * are fully independent per account type.
 *
 * `registration` is deliberately **not** `phone_verify`, even though both prove the same thing.
 * `phone_verify` belongs to an account that already exists and is requested with an access token;
 * `registration` is requested by an anonymous caller who has no account yet. Sharing one namespace
 * would let a code issued for one be replayed against the other, and would make the anonymous
 * endpoint's abuse budget the same bucket as the authenticated one's.
 */
export type OtpPurpose = 'phone_verify' | 'password_reset' | 'registration';

/** Returned by OtpService.request — identical whether the Dev or Eskiz provider sent the SMS. */
export interface OtpRequestResult {
  sent: boolean;
  expiresInSeconds: number;
  resendCooldownSeconds: number;
}
