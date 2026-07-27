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
  ApiCreatedEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ConnectionsService } from '../application/connections.service';
import { ConnectionSummaryPageDto } from './dto/connection-list.dto';
import { ConnectionDto } from './dto/connection.dto';
import { ConnectionsQueryDto, RequestsQueryDto } from './dto/queries.dto';
import { RequestItemPageDto } from './dto/request-list.dto';
import { SendConnectionRequestDto } from './dto/requests.dto';

/** LinkedIn-style connection requests + the caller's connection list (C1). Students only. */
@ApiTags('Connections')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post('requests')
  @ApiOperation({
    summary: 'Send a connection request',
    description: 'If the addressee already sent you a pending request, this auto-accepts it (C1).',
  })
  @ApiCreatedEnvelope(ConnectionDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.STUDENT_NOT_FOUND,
    'No student with this id.',
    'Foydalanuvchi topilmadi',
  )
  @ApiValidationEnvelope()
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendConnectionRequestDto,
  ): Promise<ConnectionDto> {
    return ConnectionDto.fromDomain(await this.connections.sendRequest(user, dto.addresseeId));
  }

  @Get('requests')
  @ApiOperation({ summary: 'List pending requests (incoming or outgoing)' })
  @ApiOkEnvelope(RequestItemPageDto)
  @ApiValidationEnvelope()
  async requests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RequestsQueryDto,
  ): Promise<RequestItemPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.connections.listRequests(user, query.direction, page, size);
    return RequestItemPageDto.fromPage(result, page, size);
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept an incoming request' })
  @ApiParam({ name: 'id', description: 'Connection request id' })
  @ApiOkEnvelope(ConnectionDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.CONNECTION_REQUEST_NOT_FOUND,
    'No pending request with this id addressed to you.',
    "So'rov topilmadi",
  )
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ConnectionDto> {
    return ConnectionDto.fromDomain(await this.connections.accept(user, id));
  }

  @Post('requests/:id/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Decline an incoming request' })
  @ApiParam({ name: 'id', description: 'Connection request id' })
  @ApiOkEnvelope(undefined, 'Declined; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.CONNECTION_REQUEST_NOT_FOUND,
    'No pending request with this id addressed to you.',
    "So'rov topilmadi",
  )
  async decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.connections.decline(user, id);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's connections" })
  @ApiOkEnvelope(ConnectionSummaryPageDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConnectionsQueryDto,
  ): Promise<ConnectionSummaryPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.connections.listConnections(user, page, size);
    return ConnectionSummaryPageDto.fromPage(result, page, size);
  }

  @Delete(':studentId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a connection (disconnect)' })
  @ApiParam({ name: 'studentId', description: 'The other student id' })
  @ApiOkEnvelope(undefined, 'Disconnected; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.CONNECTION_NOT_FOUND,
    'Not connected to this student.',
    'Bog‘lanish topilmadi',
  )
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ): Promise<void> {
    await this.connections.remove(user, studentId);
  }
}
