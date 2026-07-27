/**
 * The compact view of a student shown wherever a person appears (search, connections, requests).
 * `online`/`lastSeenAt` are populated only for connections (privacy, C7) and stay `false`/`null`
 * in Plan 1 — presence lands in Plan 2 (chat).
 */
export interface StudentSummary {
  id: string;
  username: string | null;
  /** `firstName` + `lastName` joined, or `null` when neither is set. */
  fullName: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: Date | null;
}
