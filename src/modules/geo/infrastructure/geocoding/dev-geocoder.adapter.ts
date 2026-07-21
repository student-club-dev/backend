import { Injectable, Logger } from '@nestjs/common';
import { GeocoderMatch, GeocoderPort, GeocoderReverseResult } from '../../domain/geocoder.port';

/**
 * Local/dev geocoder — makes NO external call. Returns no matches / no address so the app boots and
 * tests run without a Yandex key. The factory refuses to bind this in production (fail-fast), so a
 * live system always uses the real provider.
 */
@Injectable()
export class DevGeocoderAdapter implements GeocoderPort {
  private readonly logger = new Logger(DevGeocoderAdapter.name);

  geocode(query: string): Promise<GeocoderMatch[]> {
    this.logger.log(`[DEV GEOCODE] query="${query}" → [] (no external call)`);
    return Promise.resolve([]);
  }

  reverseGeocode(lat: number, lng: number): Promise<GeocoderReverseResult> {
    this.logger.log(`[DEV GEOCODE] reverse ${lat},${lng} → null address (no external call)`);
    return Promise.resolve({ address: null });
  }
}
