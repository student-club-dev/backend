import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { FilterSchemaService } from '../application/filter-schema.service';
import { FilterSchemaRequestDto } from './dto/filter-schema-request.dto';
import { FilterSchemaDto } from './dto/filter-schema.dto';

/**
 * The filter screen's schema endpoint. Its path sits on the catalog surface, but the logic is
 * listing aggregation — hence the discounts module (see the module docblock).
 */
@ApiTags('Catalog (student feed)')
@Controller('catalog')
export class FilterSchemaController {
  constructor(private readonly filterSchemaService: FilterSchemaService) {}

  @Post('filter-schema')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Which filters are available for the selected groups/types',
    description:
      'The client renders the filter screen straight from this response and never hard-codes a key (Q6). Only values that actually occur in visible listings are returned, each with its count, so no selectable filter can produce zero results.',
  })
  @ApiOkEnvelope(FilterSchemaDto)
  async getFilterSchema(@Body() body: FilterSchemaRequestDto): Promise<FilterSchemaDto> {
    const schema = await this.filterSchemaService.getSchema({
      groupKeys: body.groupKeys,
      types: body.types ?? [],
      categoryKeys: body.categoryKeys ?? [],
      geo: body.geo?.toDomain() ?? null,
    });
    return FilterSchemaDto.fromDomain(schema);
  }
}
