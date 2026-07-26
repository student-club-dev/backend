import { Module } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RedisModule } from '../../infrastructure/cache/redis.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BusinessTypeAdminService } from './application/business-type-admin.service';
import { CatalogGroupsService } from './application/catalog-groups.service';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { CatalogPrismaRepository } from './infrastructure/catalog.prisma.repository';
import { AdminBusinessTypeController } from './presentation/admin-business-type.controller';
import { CatalogGroupsController } from './presentation/catalog-groups.controller';
import { CatalogController } from './presentation/catalog.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [CatalogController, CatalogGroupsController, AdminBusinessTypeController],
  providers: [
    CatalogService,
    CatalogGroupsService,
    BusinessTypeAdminService,
    AdminGuard,
    { provide: CATALOG_REPOSITORY, useClass: CatalogPrismaRepository },
  ],
  exports: [CATALOG_REPOSITORY],
})
export class CatalogModule {}
