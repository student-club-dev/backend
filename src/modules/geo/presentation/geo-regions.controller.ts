import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { ApiNotFoundEnvelope, ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { GeoService } from '../application/geo.service';
import { DistrictDto } from './dto/district.dto';
import { RegionDto } from './dto/region.dto';

/**
 * The contract paths for geo reference data (`elon-uz.json`: `/geo/regions` and
 * `/geo/regions/{regionId}/districts`), serving exactly the same data as `/regions` and
 * `/districts`.
 *
 * Both sets exist on purpose. `/regions` and `/districts` are already documented and shipped to the
 * admin panel (`docs/api/admin-panel/08-geo.md` §3–4), so moving them would break it; the mobile
 * client is generated from the OpenAPI document and calls these. One {@link GeoService} behind
 * both — no logic is duplicated, only the routes.
 *
 * Public (no auth), like the controllers it mirrors. Served under the `/v1` prefix.
 */
@ApiTags('Geo')
@Controller('geo/regions')
export class GeoRegionsController {
  constructor(private readonly geoService: GeoService) {}

  @Get()
  @ApiOperation({
    summary: 'List regions (14 total)',
    description: 'Contract-path alias of `GET /regions` — identical response.',
  })
  @ApiOkEnvelope([RegionDto])
  async getRegions(): Promise<RegionDto[]> {
    const regions = await this.geoService.getRegions();
    return regions.map(RegionDto.fromDomain);
  }

  @Get(':regionId/districts')
  @ApiOperation({
    summary: 'List a region’s districts',
    description: 'Contract-path alias of `GET /districts?regionId=` — identical response.',
  })
  @ApiParam({ name: 'regionId', description: 'Region id', example: 'TOSHKENT_SHAHRI' })
  @ApiOkEnvelope([DistrictDto])
  @ApiNotFoundEnvelope(ERROR_CODE.NOT_FOUND, 'No region with this id.', 'Viloyat topilmadi')
  async getDistricts(@Param('regionId') regionId: string): Promise<DistrictDto[]> {
    const districts = await this.geoService.getDistricts(regionId);
    return districts.map(DistrictDto.fromDomain);
  }
}
