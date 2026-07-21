import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { TradeCentersService } from './application/trade-centers.service';
import { TRADE_CENTER_REPOSITORY } from './domain/trade-center.repository';
import { TradeCenterPrismaRepository } from './infrastructure/trade-center.prisma.repository';
import { TradeCentersController } from './presentation/trade-centers.controller';

/**
 * Read-only trade-center reference data (JWT-guarded). Exports TRADE_CENTER_REPOSITORY so the
 * branches module can validate a branch's trade-center selection against it.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [TradeCentersController],
  providers: [
    TradeCentersService,
    JwtAuthGuard,
    { provide: TRADE_CENTER_REPOSITORY, useClass: TradeCenterPrismaRepository },
  ],
  exports: [TRADE_CENTER_REPOSITORY],
})
export class TradeCentersModule {}
