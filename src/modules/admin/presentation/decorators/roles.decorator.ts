import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../../domain/enums/admin-role.enum';

/** Metadata key holding the admin roles allowed on a route (read by AdminRoleGuard). */
export const ADMIN_ROLES_KEY = 'admin_roles';

/**
 * Restricts a route to the given admin role(s). Apply with AdminRoleGuard (after AdminJwtGuard):
 * `@Roles(AdminRole.ADMIN)`. No decorator / empty list → any authenticated admin.
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
