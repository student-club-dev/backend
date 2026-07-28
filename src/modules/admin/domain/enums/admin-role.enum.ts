/**
 * Admin-panel roles (Faza 0). Pure TS enum — NOT persisted to the DB. The role is baked into the
 * admin access-token payload and drives RBAC via `@Roles(...)` + AdminRoleGuard.
 *
 * Permission matrix: ADMIN = everything (incl. delete, config); MODERATOR = moderation + read + ban,
 * but no delete/config.
 */
export enum AdminRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}
