import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { StudentListQuery } from '../application/connections.io';
import { ConnectionsService } from '../application/connections.service';
import { StudentSort } from '../domain/student-directory.repository';
import { SearchQueryDto, StudentsQueryDto } from './dto/queries.dto';
import { SearchResultDto, SearchResultPageDto } from './dto/search-result.dto';

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

  // Declared last on purpose: Nest matches routes in declaration order, so a `:id` placed above
  // `search` would swallow `GET /v1/students/search` and treat "search" as a student id.
  @Get(':id')
  @ApiOperation({
    summary: 'One student’s profile',
    description:
      'The same row `GET /v1/students` returns, for a single student — so a profile can be opened ' +
      'from anywhere, not only from a list or an existing conversation. `bio`, `photos` and ' +
      '`phoneNumber` are included, each subject to that student’s own privacy settings. Passing ' +
      'your own id works and returns your own row.',
  })
  @ApiParam({ name: 'id', description: 'Student id' })
  @ApiOkEnvelope(SearchResultDto)
  @ApiNotFoundEnvelope(ERROR_CODE.STUDENT_NOT_FOUND, 'No such student.', 'Foydalanuvchi topilmadi')
  @ApiErrorEnvelope(
    403,
    ERROR_CODE.USER_BLOCKED,
    'One of you has blocked the other. A 403 rather than a 404 — you can already tell this ' +
      'account exists, so hiding it would only look broken.',
  )
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SearchResultDto> {
    return SearchResultDto.fromResult(await this.connections.getStudent(user, id));
  }
}
