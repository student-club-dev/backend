import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { GeoService } from '../application/geo.service';
import { MetroStationDto } from './dto/metro-station.dto';

/**
 * Metro station reference data (public, no auth) — feeds the branch form's `metroStation`
 * autocomplete. `Branch.metroStation` remains free text, so this list is a convenience, never a
 * constraint on what an owner may type.
 *
 * No `?regionId=` filter: the network is Tashkent-only, and a parameter with exactly one legal
 * value is noise. Served under the `/v1` prefix.
 */
@ApiTags('Geo')
@Controller('geo/metro-stations')
export class MetroStationsController {
  constructor(private readonly geoService: GeoService) {}

  @Get()
  @ApiOperation({
    summary: 'List Tashkent metro stations',
    description: 'All 50 stations across 4 lines, ordered by line then position along the line.',
  })
  @ApiOkEnvelope([MetroStationDto])
  async getMetroStations(): Promise<MetroStationDto[]> {
    const stations = await this.geoService.getMetroStations();
    return stations.map(MetroStationDto.fromDomain);
  }
}
