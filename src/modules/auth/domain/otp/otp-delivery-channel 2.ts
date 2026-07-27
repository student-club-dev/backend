/** Injection token for the active OTP delivery channel (bound by OtpDeliveryModule per OTP_CHANNEL). */
export const OTP_DELIVERY_CHANNEL = Symbol('OTP_DELIVERY_CHANNEL');

/**
 * Port for delivering a one-time code. OtpService depends on this interface only; the concrete
 * channel (Dev / Telegram / SMS) is selected by config, so switching is env-only — zero code change.
 */
export interface OtpDeliveryChannel {
  deliver(phoneNumber: string, code: string): Promise<void>;
}
