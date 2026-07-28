import { AccountType } from '../../../common/enums/account-type.enum';
import { AdminRole } from './enums/admin-role.enum';

/** An authenticated admin identity — env-based, so the email is the stable identifier (no DB id). */
export interface AdminPrincipal {
  email: string;
  role: AdminRole;
}

/**
 * Admin access-token payload. Mirrors the base JwtPayload (`sub` + `type`) but pins `type` to
 * ADMIN and carries the RBAC `role`. `sub` holds the admin email (env-based auth has no DB id).
 */
export interface AdminJwtPayload {
  sub: string;
  type: AccountType.ADMIN;
  role: AdminRole;
}

/** The admin principal placed on `req.user` by AdminJwtGuard. `id` is the admin email. */
export interface AuthenticatedAdmin {
  id: string;
  type: AccountType.ADMIN;
  role: AdminRole;
}
