import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../../infrastructure/cache/redis.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { AdminJwtGuard } from '../admin/presentation/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { BusinessTypeAdminService } from './application/business-type-admin.service';
import { CatalogGroupsService } from './application/catalog-groups.service';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { CatalogPrismaRepository } from './infrastructure/catalog.prisma.repository';
import { AdminBusinessTypeController } from './presentation/admin-business-type.controller';
import { CatalogGroupsController } from './presentation/catalog-groups.controller';
import { CatalogController } from './presentation/catalog.controller';

/**
 * Public catalog reads + admin business-type CRUD. JwtModule is registered (empty config) so the
 * admin guards can inject JwtService; the admin business-type endpoints are ADMIN-only via
 * AdminJwtGuard + AdminRoleGuard (the guard classes come from the admin module — importing that
 * module would cycle through Business/Listings, so the two stateless guards are provided here).
 */
@Module({
  imports: [PrismaModule, RedisModule, JwtModule.register({})],
  controllers: [CatalogController, CatalogGroupsController, AdminBusinessTypeController],
  providers: [
    CatalogService,
    CatalogGroupsService,
    BusinessTypeAdminService,
    AdminJwtGuard,
    AdminRoleGuard,
    { provide: CATALOG_REPOSITORY, useClass: CatalogPrismaRepository },
  ],
  exports: [CATALOG_REPOSITORY],
})
export class CatalogModule {}
