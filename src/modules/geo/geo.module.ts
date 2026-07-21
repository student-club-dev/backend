import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { GeocodingService } from './application/geocoding.service';
import { GeoService } from './application/geo.service';
import { GEO_REPOSITORY } from './domain/geo.repository';
import { GEOCODER, GeocoderPort } from './domain/geocoder.port';
import { GeoPrismaRepository } from './infrastructure/geo.prisma.repository';
import { DevGeocoderAdapter } from './infrastructure/geocoding/dev-geocoder.adapter';
import { createGeocoder } from './infrastructure/geocoding/geocoder.factory';
import { YandexGeocoderAdapter } from './infrastructure/geocoding/yandex-geocoder.adapter';
import { DistrictsController } from './presentation/districts.controller';
import { GeocodeController } from './presentation/geocode.controller';
import { RegionsController } from './presentation/regions.controller';

/**
 * Binds GEOCODER to the concrete provider chosen by GEOCODER_PROVIDER (dev | yandex). Both are
 * constructed; the factory picks one and fails fast if Dev is selected in production. Consumers
 * depend on the GeocoderPort interface only — enabling real geocoding is env-only.
 */
@Module({
  imports: [PrismaModule],
  controllers: [RegionsController, DistrictsController, GeocodeController],
  providers: [
    GeoService,
    GeocodingService,
    { provide: GEO_REPOSITORY, useClass: GeoPrismaRepository },
    DevGeocoderAdapter,
    YandexGeocoderAdapter,
    {
      provide: GEOCODER,
      inject: [ConfigService, DevGeocoderAdapter, YandexGeocoderAdapter],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevGeocoderAdapter,
        yandex: YandexGeocoderAdapter,
      ): GeocoderPort =>
        createGeocoder(
          config.get('GEOCODER_PROVIDER', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          dev,
          yandex,
        ),
    },
  ],
  exports: [GEO_REPOSITORY],
})
export class GeoModule {}
