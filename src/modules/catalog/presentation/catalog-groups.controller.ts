import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { CatalogGroupsService } from '../application/catalog-groups.service';
import { CatalogGroupsRequestDto } from './dto/catalog-groups-request.dto';
import { CatalogGroupDto } from './dto/catalog-group.dto';
import { CatalogTypeDto } from './dto/catalog-type.dto';
import { CatalogTypesRequestDto } from './dto/catalog-types-request.dto';

/**
 * Student-feed catalog endpoints (STUDENT_FEED.md §3). POST-only with everything in the body
 * (Q2 — no id ever travels in a URL); public, because a student browses before signing up (D5).
 */
@ApiTags('Catalog (student feed)')
@Controller('catalog')
export class CatalogGroupsController {
  constructor(private readonly catalogGroupsService: CatalogGroupsService) {}

  @Post('groups')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the catalog groups',
    description:
      'The 8 home-screen groups with their type and visible-listing counts. Empty groups are returned with `listingsCount: 0` so the client can dim rather than hide them.',
  })
  @ApiOkEnvelope([CatalogGroupDto])
  async getGroups(@Body() body: CatalogGroupsRequestDto): Promise<CatalogGroupDto[]> {
    const groups = await this.catalogGroupsService.getGroups(body.geo?.toDomain() ?? null);
    return groups.map(CatalogGroupDto.fromDomain);
  }

  @Post('types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the business types inside the given groups',
    description:
      '`gender` narrows the list of types only — counts are never gender-filtered, so a group total always equals the sum of its types.',
  })
  @ApiOkEnvelope([CatalogTypeDto])
  async getTypes(@Body() body: CatalogTypesRequestDto): Promise<CatalogTypeDto[]> {
    const types = await this.catalogGroupsService.getTypes(
      body.groupKeys,
      body.gender ?? null,
      body.geo?.toDomain() ?? null,
    );
    return types.map(CatalogTypeDto.fromDomain);
  }
}
