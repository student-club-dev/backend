import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminStudentsService } from '../application/admin-students.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminStudentListQueryDto } from './dto/admin-student-list-query.dto';
import { AdminStudentDto, AdminStudentPageDto } from './dto/admin-student.dto';

/**
 * Admin cross-user student reads (Faza 1) — the panel's "see everyone" view. Accessible to both
 * ADMIN and MODERATOR, so guarded by AdminJwtGuard only (no `@Roles` restriction). Served under `/v1`.
 */
@ApiTags('Admin — Students')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/students')
export class AdminStudentsController {
  constructor(private readonly adminStudentsService: AdminStudentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all students (filter + pagination)',
    description:
      '`q` matches firstName / lastName / username / phoneNumber / email (case-insensitive contains).',
  })
  @ApiOkEnvelope(AdminStudentPageDto)
  @ApiValidationEnvelope()
  async list(@Query() query: AdminStudentListQueryDto): Promise<AdminStudentPageDto> {
    const filter = query.toFilter();
    const page = await this.adminStudentsService.list(filter);
    return AdminStudentPageDto.fromPage(page, filter.page, filter.size);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one student by id (every field except passwordHash)' })
  @ApiParam({ name: 'id', description: 'Student id' })
  @ApiOkEnvelope(AdminStudentDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.STUDENT_NOT_FOUND,
    'No student with this id.',
    'Student topilmadi',
  )
  async getById(@Param('id') id: string): Promise<AdminStudentDto> {
    const student = await this.adminStudentsService.getById(id);
    return AdminStudentDto.fromDomain(student);
  }
}
