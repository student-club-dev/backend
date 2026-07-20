import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ProfileService } from '../application/profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileDto } from './dto/user-profile.dto';

/**
 * The authenticated account's own profile. One controller serves both account types — the type
 * comes from the access token (`req.user.type`), and the service dispatches to the matching table.
 */
@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated account's profile" })
  @ApiOkResponse({ type: UserProfileDto })
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
  @ApiOkResponse({ type: UserProfileDto })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const profile = await this.profileService.updateMyProfile(user, dto.toInput());
    return UserProfileDto.fromDomain(profile);
  }

  // TODO(media): POST /profile/me/avatar — deferred; needs the media/storage module.
}
