import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ConnectionsService } from '../application/connections.service';
import { BlockedStudentPageDto } from './dto/block-list.dto';
import { ConnectionsQueryDto } from './dto/queries.dto';
import { BlockDto } from './dto/requests.dto';

/** Block / unblock a student (C1). Blocking removes any connection between the pair. Students only. */
@ApiTags('Connections')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Block a student (idempotent; removes any connection)' })
  @ApiOkEnvelope(undefined, 'Blocked; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.STUDENT_NOT_FOUND,
    'No student with this id.',
    'Foydalanuvchi topilmadi',
  )
  @ApiValidationEnvelope()
  async block(@CurrentUser() user: AuthenticatedUser, @Body() dto: BlockDto): Promise<void> {
    await this.connections.block(user, dto.studentId);
  }

  @Get()
  @ApiOperation({
    summary: 'List the students you have blocked (newest first)',
    description:
      'One-directional: who blocked *you* is not shown. Presence is always masked — blocking ' +
      'removes the connection (§18).',
  })
  @ApiOkEnvelope(BlockedStudentPageDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConnectionsQueryDto,
  ): Promise<BlockedStudentPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.connections.listBlocked(user, page, size);
    return BlockedStudentPageDto.fromPage(result, page, size);
  }

  @Delete(':studentId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unblock a student (idempotent)' })
  @ApiParam({ name: 'studentId', description: 'The blocked student id' })
  @ApiOkEnvelope(undefined, 'Unblocked; `result` is null.')
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ): Promise<void> {
    await this.connections.unblock(user, studentId);
  }
}
