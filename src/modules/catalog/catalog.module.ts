import { Module } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BusinessTypeAdminService } from './application/business-type-admin.service';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { CatalogPrismaRepository } from './infrastructure/catalog.prisma.repository';
import { AdminBusinessTypeController } from './presentation/admin-business-type.controller';
import { CatalogController } from './presentation/catalog.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController, AdminBusinessTypeController],
  providers: [
    CatalogService,
    BusinessTypeAdminService,
    AdminGuard,
    { provide: CATALOG_REPOSITORY, useClass: CatalogPrismaRepository },
  ],
  exports: [CATALOG_REPOSITORY],
})
export class CatalogModule {}
