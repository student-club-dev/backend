import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GeoService } from '../application/geo.service';
import { DistrictQueryDto } from './dto/district-query.dto';
import { DistrictDto } from './dto/district.dto';

/** Public geo reference data — districts (no auth). Served under the `/v1` prefix. */
@ApiTags('Geo')
@Controller('districts')
export class DistrictsController {
  constructor(private readonly geoService: GeoService) {}

  @Get()
  @ApiOperation({
    summary: 'List districts',
    description:
      "All districts, or a single region's districts when `regionId` is supplied. An unknown `regionId` returns 404.",
  })
  @ApiQuery({
    name: 'regionId',
    required: false,
    description: 'Filter by region. Omit to return all districts.',
  })
  @ApiOkResponse({ type: [DistrictDto] })
  async getDistricts(@Query() query: DistrictQueryDto): Promise<DistrictDto[]> {
    const districts = await this.geoService.getDistricts(query.regionId ?? null);
    return districts.map(DistrictDto.fromDomain);
  }
}
