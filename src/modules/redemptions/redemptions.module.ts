import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { BranchesModule } from '../branches/branches.module';
import { BusinessModule } from '../business/business.module';
import { BusinessAccountGuard } from '../business/presentation/guards/business-account.guard';
import { ListingsModule } from '../listings/listings.module';
import { RedemptionsService } from './application/redemptions.service';
import { REDEMPTION_REPOSITORY } from './domain/redemption.repository';
import { RedemptionPrismaRepository } from './infrastructure/redemption.prisma.repository';
import { RedeemStartController } from './presentation/redeem-start.controller';
import { RedemptionsController } from './presentation/redemptions.controller';

/**
 * Redemption (DISCOUNTS_BUSINESS_API §5.6): student issues a code (`start`), cashier verifies +
 * confirms, owner reads the history. Reuses the listing read port (LISTING_REPOSITORY), the business
 * read port (ownership) and the branch read port (confirm's branch check).
 */
@Module({
  imports: [PrismaModule, JwtModule.register({}), ListingsModule, BusinessModule, BranchesModule],
  controllers: [RedeemStartController, RedemptionsController],
  providers: [
    RedemptionsService,
    JwtAuthGuard,
    StudentGuard,
    BusinessAccountGuard,
    { provide: REDEMPTION_REPOSITORY, useClass: RedemptionPrismaRepository },
  ],
})
export class RedemptionsModule {}
