import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BusinessAccountGuard } from '../business/presentation/guards/business-account.guard';
import { GeoModule } from '../geo/geo.module';
import { BranchesService } from './application/branches.service';
import { BRANCH_REPOSITORY } from './domain/branches.repository';
import { OWNING_BUSINESS_REPOSITORY } from './domain/owning-business.repository';
import { BranchPrismaRepository } from './infrastructure/branch.prisma.repository';
import { OwningBusinessPrismaRepository } from './infrastructure/owning-business.prisma.repository';
import { BranchesController } from './presentation/branches.controller';

/**
 * Owner-side branch CRUD, nested under a business. Reuses BusinessAccountGuard (the BUSINESS-account
 * gate) and JwtModule for the JwtAuthGuard. Per-aggregate repositories are bound here.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({}), GeoModule],
  controllers: [BranchesController],
  providers: [
    BranchesService,
    JwtAuthGuard,
    BusinessAccountGuard,
    { provide: BRANCH_REPOSITORY, useClass: BranchPrismaRepository },
    { provide: OWNING_BUSINESS_REPOSITORY, useClass: OwningBusinessPrismaRepository },
  ],
})
export class BranchesModule {}
