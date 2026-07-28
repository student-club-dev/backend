import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
import { StudentListQuery } from '../application/connections.io';
import { ConnectionsService } from '../application/connections.service';
import { StudentSort } from '../domain/student-directory.repository';
import { SearchQueryDto, StudentsQueryDto } from './dto/queries.dto';
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

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'List students, optionally filtered',
    description:
      'The student directory. Every filter is optional and they combine (AND); multi-value ' +
      'filters accept `a,b`. Excludes yourself and anyone blocked either way; each row carries ' +
      '`connectionStatus`. Rate-limited to 30 requests/minute per IP.',
  })
  @ApiOkEnvelope(SearchResultPageDto)
  @ApiValidationEnvelope()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StudentsQueryDto,
  ): Promise<SearchResultPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const filter: StudentListQuery = {
      q: query.q ?? null,
      universityIds: query.universityId ?? [],
      genders: query.gender ?? [],
      courseYears: query.courseYear ?? [],
      birthYearFrom: query.birthYearFrom ?? null,
      birthYearTo: query.birthYearTo ?? null,
      sort: query.sort ?? StudentSort.RECENT,
      connectionStatus: query.connectionStatus ?? null,
    };
    const result = await this.connections.listStudents(user, filter, page, size);
    return SearchResultPageDto.fromPage(result, page, size);
  }

  @Get('search')
  @ApiOperation({
    deprecated: true,
    summary: 'Search students by username or full name (deprecated — use `GET /v1/students`)',
    description:
      'Kept only so existing clients keep working. Identical to `GET /v1/students?q=&sort=NAME`, ' +
      'which supersedes it and adds the university / course / gender / birth-year / relationship ' +
      'filters. `q` is now optional.',
  })
  @ApiOkEnvelope(SearchResultPageDto)
  @ApiValidationEnvelope()
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.connections.search(user, query.q ?? null, page, size);
    return SearchResultPageDto.fromPage(result, page, size);
  }
}
