import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthService } from './application/admin-auth.service';
import { AdminAuthController } from './presentation/admin-auth.controller';
import { AdminJwtGuard } from './presentation/guards/admin-jwt.guard';
import { AdminRoleGuard } from './presentation/guards/admin-role.guard';

/**
 * Env-based admin auth + RBAC (Faza 0). JwtModule is registered (empty config) so the guards and
 * AdminAuthService can inject JwtService; tokens are signed/verified with JWT_ACCESS_SECRET read
 * from config — the SAME secret the app auth module uses (no new secret). ConfigService is global.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtGuard, AdminRoleGuard],
})
export class AdminModule {}
