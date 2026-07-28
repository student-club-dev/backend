import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthService } from './application/admin-auth.service';
import { AdminBranchesService } from './application/admin-branches.service';
import { AdminBusinessOwnersService } from './application/admin-business-owners.service';
import { AdminBusinessesService } from './application/admin-businesses.service';
import { AdminDashboardService } from './application/admin-dashboard.service';
import { AdminListingsService } from './application/admin-listings.service';
import { AdminStudentsService } from './application/admin-students.service';
import { ADMIN_BRANCH_READ_REPOSITORY } from './domain/admin-branch-read.repository';
import { ADMIN_BUSINESS_OWNER_READ_REPOSITORY } from './domain/admin-business-owner-read.repository';
import { ADMIN_BUSINESS_READ_REPOSITORY } from './domain/admin-business-read.repository';
import { ADMIN_DASHBOARD_READ_REPOSITORY } from './domain/admin-dashboard-read.repository';
import { ADMIN_LISTING_READ_REPOSITORY } from './domain/admin-listing-read.repository';
import { ADMIN_STUDENT_READ_REPOSITORY } from './domain/admin-student-read.repository';
import { AdminBranchReadPrismaRepository } from './infrastructure/admin-branch-read.prisma.repository';
import { AdminBusinessOwnerReadPrismaRepository } from './infrastructure/admin-business-owner-read.prisma.repository';
import { AdminBusinessReadPrismaRepository } from './infrastructure/admin-business-read.prisma.repository';
import { AdminDashboardReadPrismaRepository } from './infrastructure/admin-dashboard-read.prisma.repository';
import { AdminListingReadPrismaRepository } from './infrastructure/admin-listing-read.prisma.repository';
import { AdminStudentReadPrismaRepository } from './infrastructure/admin-student-read.prisma.repository';
import { AdminAuthController } from './presentation/admin-auth.controller';
import { AdminBranchesController } from './presentation/admin-branches.controller';
import { AdminBusinessOwnersController } from './presentation/admin-business-owners.controller';
import { AdminBusinessesController } from './presentation/admin-businesses.controller';
import { AdminDashboardController } from './presentation/admin-dashboard.controller';
import { AdminListingsController } from './presentation/admin-listings.controller';
import { AdminStudentsController } from './presentation/admin-students.controller';
import { AdminJwtGuard } from './presentation/guards/admin-jwt.guard';
import { AdminRoleGuard } from './presentation/guards/admin-role.guard';

/**
 * Env-based admin auth + RBAC (Faza 0) plus the cross-user READ endpoints (Faza 1). JwtModule is
 * registered (empty config) so the guards and AdminAuthService can inject JwtService; tokens are
 * signed/verified with JWT_ACCESS_SECRET read from config — the SAME secret the app auth module uses
 * (no new secret). ConfigService and PrismaService are global, so the read repositories inject
 * PrismaService directly. Faza 1 read repos are bound to their domain ports here.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    AdminAuthController,
    AdminStudentsController,
    AdminBusinessOwnersController,
    AdminBusinessesController,
    AdminBranchesController,
    AdminListingsController,
    AdminDashboardController,
  ],
  providers: [
    AdminAuthService,
    AdminStudentsService,
    AdminBusinessOwnersService,
    AdminBusinessesService,
    AdminBranchesService,
    AdminListingsService,
    AdminDashboardService,
    AdminJwtGuard,
    AdminRoleGuard,
    { provide: ADMIN_STUDENT_READ_REPOSITORY, useClass: AdminStudentReadPrismaRepository },
    {
      provide: ADMIN_BUSINESS_OWNER_READ_REPOSITORY,
      useClass: AdminBusinessOwnerReadPrismaRepository,
    },
    { provide: ADMIN_BUSINESS_READ_REPOSITORY, useClass: AdminBusinessReadPrismaRepository },
    { provide: ADMIN_BRANCH_READ_REPOSITORY, useClass: AdminBranchReadPrismaRepository },
    { provide: ADMIN_LISTING_READ_REPOSITORY, useClass: AdminListingReadPrismaRepository },
    { provide: ADMIN_DASHBOARD_READ_REPOSITORY, useClass: AdminDashboardReadPrismaRepository },
  ],
})
export class AdminModule {}
