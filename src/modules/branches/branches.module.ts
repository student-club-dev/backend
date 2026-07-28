import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BusinessModule } from '../business/business.module';
import { BusinessAccountGuard } from '../business/presentation/guards/business-account.guard';
import { GeoModule } from '../geo/geo.module';
import { TradeCentersModule } from '../trade-centers/trade-centers.module';
import { BranchesService } from './application/branches.service';
import { BRANCH_REPOSITORY } from './domain/branches.repository';
import { BranchPrismaRepository } from './infrastructure/branch.prisma.repository';
import { BranchesController } from './presentation/branches.controller';

/**
 * Owner-side branch CRUD, nested under a business. Reuses BusinessAccountGuard (the BUSINESS-account
 * gate) and JwtModule for the JwtAuthGuard. Per-aggregate repositories are bound here.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({}), GeoModule, TradeCentersModule, BusinessModule],
  controllers: [BranchesController],
  providers: [
    BranchesService,
    JwtAuthGuard,
    BusinessAccountGuard,
    { provide: BRANCH_REPOSITORY, useClass: BranchPrismaRepository },
  ],
  exports: [BRANCH_REPOSITORY, BranchesService],
})
export class BranchesModule {}
