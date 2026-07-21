import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { BusinessService } from './application/business.service';
import { BUSINESS_READ } from './domain/business-read.repository';
import { BUSINESS_OWNER_REPOSITORY } from './domain/business-owner.repository';
import { BUSINESS_REPOSITORY } from './domain/business.repository';
import { BusinessOwnerPrismaRepository } from './infrastructure/business-owner.prisma.repository';
import { BusinessReadPrismaRepository } from './infrastructure/business-read.prisma.repository';
import { BusinessPrismaRepository } from './infrastructure/business.prisma.repository';
import { BusinessController } from './presentation/business.controller';
import { BusinessAccountGuard } from './presentation/guards/business-account.guard';

/**
 * Owner-side business CRUD. Imports CatalogModule for the catalog repository (business-type
 * validation) and JwtModule for the JwtAuthGuard. The BUSINESS-account gate and per-aggregate
 * repositories are bound here.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({}), CatalogModule],
  controllers: [BusinessController],
  providers: [
    BusinessService,
    JwtAuthGuard,
    BusinessAccountGuard,
    { provide: BUSINESS_REPOSITORY, useClass: BusinessPrismaRepository },
    { provide: BUSINESS_OWNER_REPOSITORY, useClass: BusinessOwnerPrismaRepository },
    { provide: BUSINESS_READ, useClass: BusinessReadPrismaRepository },
  ],
  exports: [BUSINESS_READ],
})
export class BusinessModule {}
