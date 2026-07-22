import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { ApiNotFoundEnvelope, ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { CatalogService } from '../application/catalog.service';
import { Gender } from '../domain/enums/gender.enum';
import { BusinessTypeInfoDto } from './dto/business-type-info.dto';
import { CategoryDto } from './dto/category.dto';
import { GenderQueryDto } from './dto/gender-query.dto';

/** Public catalog endpoints (static reference data — no auth). Served under the `/v1` prefix. */
@ApiTags('Catalog')
@Controller('business/types')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'List business types',
    description:
      'Personalised when `gender` is supplied: MALE excludes BEAUTY_SALON, FEMALE excludes BARBERSHOP.',
  })
  @ApiQuery({
    name: 'gender',
    enum: Gender,
    required: false,
    description: 'User gender — filters the list of types. All types are returned when omitted.',
  })
  @ApiOkEnvelope([BusinessTypeInfoDto])
  async getBusinessTypes(@Query() query: GenderQueryDto): Promise<BusinessTypeInfoDto[]> {
    const types = await this.catalogService.getBusinessTypes(query.gender ?? null);
    return types.map(BusinessTypeInfoDto.fromDomain);
  }

  @Get(':type/categories')
  @ApiOperation({
    summary: 'List categories for a business type',
    description:
      'The base list plus, for CLOTHING when `gender` is supplied, the matching per-gender categories. Each category carries its form `fields`.',
  })
  @ApiParam({ name: 'type', description: 'Business type key', example: 'CAFE_RESTAURANT' })
  @ApiQuery({
    name: 'gender',
    enum: Gender,
    required: false,
    description: 'Gender-specific categories for CLOTHING. Ignored for other types.',
  })
  @ApiOkEnvelope([CategoryDto])
  @ApiNotFoundEnvelope(
    ERROR_CODE.NOT_FOUND,
    'No business type with this key.',
    'Biznes turi topilmadi',
  )
  async getCategories(
    @Param('type') type: string,
    @Query() query: GenderQueryDto,
  ): Promise<CategoryDto[]> {
    const categories = await this.catalogService.getCategories(type, query.gender ?? null);
    return categories.map(CategoryDto.fromDomain);
  }
}
