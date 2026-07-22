import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { GeoService } from '../application/geo.service';
import { RegionDto } from './dto/region.dto';

/** Public geo reference data — regions (no auth). Served under the `/v1` prefix. */
@ApiTags('Geo')
@Controller('regions')
export class RegionsController {
  constructor(private readonly geoService: GeoService) {}

  @Get()
  @ApiOperation({ summary: 'List regions (14 total)' })
  @ApiOkEnvelope([RegionDto])
  async getRegions(): Promise<RegionDto[]> {
    const regions = await this.geoService.getRegions();
    return regions.map(RegionDto.fromDomain);
  }
}
