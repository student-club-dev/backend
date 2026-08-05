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
  @ApiOperation({
    summary: "Register this device's push token",
    description:
      'The token is routed by `platform`: `ANDROID`/`WEB` are delivered through FCM, `IOS` ' +
      'directly through APNs. An iOS device must therefore send its **APNs** token (64 hex ' +
      'characters), not an FCM one.',
  })
  @ApiOkEnvelope(undefined, 'Registered; `result` is null.')
  // One 422 response per operation, so both codes are described on it: `VALIDATION_ERROR` for an
  // empty token or an unknown platform, `INVALID_DEVICE_TOKEN` for the iOS format check.
  @ApiValidationEnvelope(
    'Validation failed — see `error.fields`. `error.code` is `VALIDATION_ERROR` for a missing ' +
      'token or an unknown `platform`, and `INVALID_DEVICE_TOKEN` when `platform=IOS` was sent ' +
      'with a token that is not 64 hex characters (typically an FCM token from an iOS build).',
  )
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.notifications.registerDevice(user, dto.token, dto.platform, dto.tokenType);
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
