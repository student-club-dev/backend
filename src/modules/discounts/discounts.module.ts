import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/cache/redis.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FilterSchemaService } from './application/filter-schema.service';
import { FACET_REPOSITORY } from './domain/facet.repository';
import { FacetPrismaRepository } from './infrastructure/facet.prisma.repository';
import { FilterSchemaController } from './presentation/filter-schema.controller';

/**
 * Student feed aggregation. Owns every read that counts or searches listings — the filter schema
 * now, `POST /discounts/search` next — so the Q4 visibility rules live in one place
 * (`visible-scope.sql.ts`) instead of being restated per endpoint.
 *
 * `CatalogModule` is imported for CATALOG_REPOSITORY: the catalog says what *can* be filtered,
 * this module measures what actually *is*.
 */
@Module({
  imports: [PrismaModule, RedisModule, CatalogModule],
  controllers: [FilterSchemaController],
  providers: [FilterSchemaService, { provide: FACET_REPOSITORY, useClass: FacetPrismaRepository }],
})
export class DiscountsModule {}
