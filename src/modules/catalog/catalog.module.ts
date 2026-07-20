import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { CatalogPrismaRepository } from './infrastructure/catalog.prisma.repository';
import { CatalogController } from './presentation/catalog.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService, { provide: CATALOG_REPOSITORY, useClass: CatalogPrismaRepository }],
})
export class CatalogModule {}
