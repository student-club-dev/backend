/** Injection token for the active SMS provider (bound by SmsProviderModule per SMS_PROVIDER). */
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/**
 * Port for sending an SMS. The application (OtpService) depends on this interface only; the concrete
 * provider (Dev / Eskiz) is selected by config, so enabling real SMS is env-only — zero code change.
 */
export interface SmsProvider {
  send(phoneNumber: string, text: string): Promise<void>;
}
