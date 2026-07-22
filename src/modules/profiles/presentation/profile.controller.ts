import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiErrorEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ProfileService } from '../application/profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileDto } from './dto/user-profile.dto';

/**
 * The authenticated account's own profile. One controller serves both account types — the type
 * comes from the access token (`req.user.type`), and the service dispatches to the matching table.
 */
@ApiTags('Profiles')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated account's profile" })
  @ApiOkEnvelope(UserProfileDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.PROFILE_NOT_FOUND,
    'Defensive — the profile backing the authenticated account no longer exists.',
    'Profil topilmadi',
  )
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    const profile = await this.profileService.getMyProfile(user);
    return UserProfileDto.fromDomain(profile);
  }

  @Put('me')
  @ApiOperation({
    summary: "Update the authenticated account's profile (partial)",
    description:
      'All fields optional. Student-only fields are ignored for a business owner; changing the phone number resets its verification.',
  })
  @ApiOkEnvelope(UserProfileDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.PROFILE_NOT_FOUND,
    'Defensive — the profile backing the authenticated account no longer exists.',
    'Profil topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ACCOUNT_EXISTS,
    'The new phone number already belongs to another account.',
    'Bu telefon bilan hisob allaqachon mavjud',
  )
  @ApiValidationEnvelope()
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const profile = await this.profileService.updateMyProfile(user, dto.toInput());
    return UserProfileDto.fromDomain(profile);
  }

  // TODO(media): POST /profile/me/avatar — deferred; needs the media/storage module.
}
