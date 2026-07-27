import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiCreatedEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ReportsService } from '../application/reports.service';
import { ReportDto } from './dto/report.dto';
import { CreateReportDto } from './dto/requests.dto';

/** Report a student or a message for abuse (C12). Students only. Feeds moderation (admin, later). */
@ApiTags('Connections')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Report a student or a message',
    description:
      'Exactly one of `targetStudentId` / `messageId`. Duplicate open reports are coalesced.',
  })
  @ApiCreatedEnvelope(ReportDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.STUDENT_NOT_FOUND,
    'No student with this id.',
    'Foydalanuvchi topilmadi',
  )
  @ApiValidationEnvelope(
    'Neither or both targets given (`REPORT_TARGET_INVALID`), or a bad reason.',
  )
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
  ): Promise<ReportDto> {
    return ReportDto.fromDomain(await this.reports.report(user, dto.toInput()));
  }
}
