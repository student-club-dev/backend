import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { NotificationsService } from '../application/notifications.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

/** Student device-token registration for push (chat.md C8). Students only. Served under `/v1`. */
@ApiTags('Notifications')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Register this device's push token" })
  @ApiOkEnvelope(undefined, 'Registered; `result` is null.')
  @ApiValidationEnvelope()
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.notifications.registerDevice(user, dto.token, dto.platform);
  }

  @Delete(':token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove a device push token (on logout)' })
  @ApiParam({ name: 'token', description: 'The push token to remove' })
  @ApiOkEnvelope(undefined, 'Removed; `result` is null.')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<void> {
    await this.notifications.removeDevice(user, token);
  }
}
