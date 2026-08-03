import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { RedisModule } from '../../infrastructure/cache/redis.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DetailService } from './application/detail.service';
import { FavoritesService } from './application/favorites.service';
import { FilterSchemaService } from './application/filter-schema.service';
import { DETAIL_REPOSITORY } from './domain/detail.repository';
import { FACET_REPOSITORY } from './domain/facet.repository';
import { FAVORITES_REPOSITORY } from './domain/favorites.repository';
import { DetailPrismaRepository } from './infrastructure/detail.prisma.repository';
import { FacetPrismaRepository } from './infrastructure/facet.prisma.repository';
import { FavoritesPrismaRepository } from './infrastructure/favorites.prisma.repository';
import { DetailController } from './presentation/detail.controller';
import { FavoritesController } from './presentation/favorites.controller';
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
  // `JwtModule.register({})` mirrors ProfileModule/BusinessModule: the guards verify the access
  // token with an explicit secret pulled from config, so no module-level signing options are needed.
  imports: [PrismaModule, RedisModule, CatalogModule, JwtModule.register({})],
  controllers: [FilterSchemaController, FavoritesController, DetailController],
  providers: [
    FilterSchemaService,
    FavoritesService,
    DetailService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    StudentGuard,
    { provide: FACET_REPOSITORY, useClass: FacetPrismaRepository },
    { provide: FAVORITES_REPOSITORY, useClass: FavoritesPrismaRepository },
    { provide: DETAIL_REPOSITORY, useClass: DetailPrismaRepository },
  ],
})
export class DiscountsModule {}
