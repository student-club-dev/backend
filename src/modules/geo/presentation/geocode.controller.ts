import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GeocodingService } from '../application/geocoding.service';
import { GeocodeRequestDto } from './dto/geocode-request.dto';
import { GeocodeResultDto } from './dto/geocode-result.dto';
import { ReverseGeocodeRequestDto } from './dto/reverse-geocode-request.dto';
import { ReverseGeocodeResponseDto } from './dto/reverse-geocode-response.dto';

/**
 * Forward/reverse geocoding — proxies Yandex (the key stays server-side) for the business-owner
 * branch form. JWT-guarded so it is not an open geocoding proxy. Thin: bind DTO, call the service,
 * map the response. Served under the `/v1` prefix.
 */
@ApiTags('Geo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geo')
export class GeocodeController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Post('geocode')
  @HttpCode(200)
  @ApiOperation({ summary: 'Geocode an address string to coordinates' })
  @ApiOkResponse({ type: [GeocodeResultDto] })
  async geocode(@Body() dto: GeocodeRequestDto): Promise<GeocodeResultDto[]> {
    const results = await this.geocoding.geocode(dto.query, dto.regionId ?? null);
    return results.map(GeocodeResultDto.from);
  }

  @Post('reverse-geocode')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reverse geocode coordinates to an address' })
  @ApiOkResponse({ type: ReverseGeocodeResponseDto })
  async reverseGeocode(@Body() dto: ReverseGeocodeRequestDto): Promise<ReverseGeocodeResponseDto> {
    const result = await this.geocoding.reverseGeocode(dto.lat, dto.lng);
    return ReverseGeocodeResponseDto.from(result);
  }
}
