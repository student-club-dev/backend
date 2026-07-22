import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiErrorEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
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
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('geo')
export class GeocodeController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Post('geocode')
  @HttpCode(200)
  @ApiOperation({ summary: 'Geocode an address string to coordinates' })
  @ApiOkEnvelope([GeocodeResultDto])
  @ApiValidationEnvelope('Invalid body, or `regionId` does not exist.')
  @ApiErrorEnvelope(
    503,
    ERROR_CODE.GEOCODER_UNAVAILABLE,
    'The geocoding provider is temporarily unavailable.',
    'Geokodlash xizmati vaqtincha ishlamayapti, keyinroq urinib ko‘ring',
  )
  async geocode(@Body() dto: GeocodeRequestDto): Promise<GeocodeResultDto[]> {
    const results = await this.geocoding.geocode(dto.query, dto.regionId ?? null);
    return results.map(GeocodeResultDto.from);
  }

  @Post('reverse-geocode')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reverse geocode coordinates to an address' })
  @ApiOkEnvelope(ReverseGeocodeResponseDto)
  @ApiValidationEnvelope(
    'Invalid body, or the coordinates are outside Uzbekistan (`LOCATION_OUT_OF_BOUNDS`).',
  )
  @ApiErrorEnvelope(
    503,
    ERROR_CODE.GEOCODER_UNAVAILABLE,
    'The geocoding provider is temporarily unavailable.',
    'Geokodlash xizmati vaqtincha ishlamayapti, keyinroq urinib ko‘ring',
  )
  async reverseGeocode(@Body() dto: ReverseGeocodeRequestDto): Promise<ReverseGeocodeResponseDto> {
    const result = await this.geocoding.reverseGeocode(dto.lat, dto.lng);
    return ReverseGeocodeResponseDto.from(result);
  }
}
