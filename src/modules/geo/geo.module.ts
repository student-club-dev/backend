import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { GeoService } from './application/geo.service';
import { GEO_REPOSITORY } from './domain/geo.repository';
import { GeoPrismaRepository } from './infrastructure/geo.prisma.repository';
import { DistrictsController } from './presentation/districts.controller';
import { RegionsController } from './presentation/regions.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RegionsController, DistrictsController],
  providers: [GeoService, { provide: GEO_REPOSITORY, useClass: GeoPrismaRepository }],
  exports: [GEO_REPOSITORY],
})
export class GeoModule {}
