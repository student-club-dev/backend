import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminStudentsService } from '../application/admin-students.service';
import { AdminStudentsWriteService } from '../application/admin-students-write.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminCreateStudentDto } from './dto/admin-create-student.dto';
import { AdminStudentListQueryDto } from './dto/admin-student-list-query.dto';
import { AdminStudentDto, AdminStudentPageDto } from './dto/admin-student.dto';
import { AdminUpdateStudentDto } from './dto/admin-update-student.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin cross-user student reads (Faza 1) + writes (Faza 3). Reads and PUT (edit) are open to both
 * ADMIN and MODERATOR (AdminJwtGuard, applied at the controller level). POST (create) is ADMIN-only
 * — AdminRoleGuard + `@Roles(AdminRole.ADMIN)` on the handler. Served under `/v1`.
 */
@ApiTags('Admin — Students')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/students')
export class AdminStudentsController {
  constructor(
    private readonly adminStudentsService: AdminStudentsService,
    private readonly adminStudentsWriteService: AdminStudentsWriteService,
  ) {}

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

  @Post()
  // AdminJwtGuard is applied at the controller level; AdminRoleGuard restricts this route to ADMIN.
  @UseGuards(AdminRoleGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Create a student (ADMIN only)',
    description:
      'Admin-set initial password (min 8); at least one of email / phoneNumber is required.',
  })
  @ApiCreatedEnvelope(AdminStudentDto)
  @ApiValidationEnvelope()
  @ApiForbiddenEnvelope('Only ADMIN may create users.')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ACCOUNT_EXISTS,
    'Email / phoneNumber (`ACCOUNT_EXISTS`) or username (`USERNAME_TAKEN`) already taken.',
    'Bu hisob allaqachon mavjud',
  )
  async create(@Body() body: AdminCreateStudentDto): Promise<AdminStudentDto> {
    const student = await this.adminStudentsWriteService.create(body.toInput());
    return AdminStudentDto.fromDomain(student);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit a student',
    description:
      'Partial update; a phone-number change resets `phoneVerified`. username is normalised and must be unique.',
  })
  @ApiParam({ name: 'id', description: 'Student id' })
  @ApiOkEnvelope(AdminStudentDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.STUDENT_NOT_FOUND,
    'No student with this id.',
    'Student topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ACCOUNT_EXISTS,
    'phoneNumber (`ACCOUNT_EXISTS`) or username (`USERNAME_TAKEN`) already taken.',
    'Bu hisob allaqachon mavjud',
  )
  async update(
    @Param('id') id: string,
    @Body() body: AdminUpdateStudentDto,
  ): Promise<AdminStudentDto> {
    const student = await this.adminStudentsWriteService.update(id, body.toInput());
    return AdminStudentDto.fromDomain(student);
  }
}
