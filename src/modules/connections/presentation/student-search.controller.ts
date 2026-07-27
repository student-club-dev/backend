import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ConnectionsService } from '../application/connections.service';
import { SearchQueryDto } from './dto/queries.dto';
import { SearchResultPageDto } from './dto/search-result.dto';

/** Student discovery for connecting (C11). Students only. Served under `/v1`. */
@ApiTags('Connections')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('students')
export class StudentSearchController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search students by username or full name',
    description:
      'Excludes yourself and anyone blocked either way. Each hit carries `connectionStatus`.',
  })
  @ApiOkEnvelope(SearchResultPageDto)
  @ApiValidationEnvelope()
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.connections.search(user, query.q, page, size);
    return SearchResultPageDto.fromPage(result, page, size);
  }
}
