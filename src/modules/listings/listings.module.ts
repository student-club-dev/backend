import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BranchesModule } from '../branches/branches.module';
import { BusinessModule } from '../business/business.module';
import { BusinessAccountGuard } from '../business/presentation/guards/business-account.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { ListingsService } from './application/listings.service';
import { LISTING_REPOSITORY } from './domain/listing.repository';
import { ListingPrismaRepository } from './infrastructure/listing.prisma.repository';
import { ListingController } from './presentation/listing.controller';
import { ListingSubmitController } from './presentation/listing-submit.controller';
import { ListingsController } from './presentation/listings.controller';

/**
 * Owner-side listing creation, nested under a business. Imports BusinessModule (the canonical
 * business read port), CatalogModule (category + attribute-schema checks) and BranchesModule (the
 * branch read port for `branchIds` ownership), plus JwtModule for the JwtAuthGuard. Reuses
 * BusinessAccountGuard (the BUSINESS-account gate). The listing repository is bound here.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({}), BusinessModule, CatalogModule, BranchesModule],
  controllers: [ListingsController, ListingController, ListingSubmitController],
  providers: [
    ListingsService,
    JwtAuthGuard,
    BusinessAccountGuard,
    { provide: LISTING_REPOSITORY, useClass: ListingPrismaRepository },
  ],
  exports: [LISTING_REPOSITORY, ListingsService],
})
export class ListingsModule {}
