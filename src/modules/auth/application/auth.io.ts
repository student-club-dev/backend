/**
 * Application-layer input/output contracts for the auth use-cases. The presentation DTOs
 * map to these; the service returns {@link AuthTokens}. Identifiers are normalised to
 * `string | null` (the DTOs pass `undefined` fields through as `null`).
 */

/** Device / session metadata captured on token issuance (D3). */
export interface DeviceContext {
  deviceName: string | null;
  platform: string | null;
  ipAddress: string | null;
}

export interface RegisterInput extends DeviceContext {
  email: string | null;
  phoneNumber: string | null;
  password: string;
  /** The `registration` OTP proving the phone belongs to the caller. Null when none was sent. */
  otpCode: string | null;
}

export interface LoginInput extends DeviceContext {
  email: string | null;
  phoneNumber: string | null;
  password: string;
}

export interface RefreshInput extends DeviceContext {
  refreshToken: string;
}

export interface LogoutInput {
  refreshToken: string;
}

/** The token pair returned by register / login / refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
