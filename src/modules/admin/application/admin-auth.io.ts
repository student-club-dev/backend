/**
 * Token issued on admin login. Refresh is intentionally omitted (Faza 0) — the access token is
 * short-lived and re-login suffices; there is no admin refresh-token store.
 */
export interface AdminTokens {
  accessToken: string;
}
