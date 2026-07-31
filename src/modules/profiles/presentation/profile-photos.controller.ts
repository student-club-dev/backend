import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ProfilePhotoService } from '../application/profile-photo.service';
import { MAX_PROFILE_PHOTOS } from '../domain/entities/profile-photo.entity';
import { AddProfilePhotoDto, ProfilePhotoDto, ProfilePhotoListDto } from './dto/profile-photo.dto';

/**
 * The student's profile-photo set — the swipeable pictures on the profile screen.
 *
 * Students only: a business owner's identity is their business, and `business_owners` has no photo
 * set. Every write here also rewrites `Student.avatarUrl`, so a client that only knows about
 * `avatarUrl` keeps working and keeps seeing the right picture.
 */
@ApiTags('Profiles')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('profile/photos')
export class ProfilePhotosController {
  constructor(private readonly photos: ProfilePhotoService) {}

  @Get()
  @ApiOperation({
    summary: 'Your profile photos, in display order',
    description: 'The first element is the current avatar and always equals `avatarUrl`.',
  })
  @ApiOkEnvelope(ProfilePhotoListDto)
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ProfilePhotoListDto> {
    return ProfilePhotoListDto.from(await this.photos.list(user));
  }

  @Post()
  @ApiOperation({
    summary: 'Add a photo — it becomes the new avatar',
    description:
      `Upload the file first with \`POST /v1/media/chat-upload\` and \`kind=PROFILE_PHOTO\` (no ` +
      `\`conversationId\`), then post the \`id\` it returns. The new photo goes to the **front** of ` +
      `the set and \`avatarUrl\` moves with it, so changing your picture is this one call. Up to ` +
      `${MAX_PROFILE_PHOTOS} photos.`,
  })
  @ApiCreatedEnvelope(ProfilePhotoDto)
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.PHOTO_LIMIT_REACHED,
    `Already at ${MAX_PROFILE_PHOTOS} photos — delete one first.`,
  )
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.MEDIA_NOT_FOUND,
    'No such upload, not yours, or not uploaded as `kind=PROFILE_PHOTO`.',
  )
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.MEDIA_ALREADY_USED,
    'That upload already backs a photo — upload again for a second one.',
  )
  @ApiValidationEnvelope()
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddProfilePhotoDto,
  ): Promise<ProfilePhotoDto> {
    return ProfilePhotoDto.fromDomain(await this.photos.add(user, dto.mediaId));
  }

  @Put(':id/main')
  @ApiOperation({
    summary: 'Promote an existing photo to avatar',
    description: 'Moves it to the front of the set; `avatarUrl` follows.',
  })
  @ApiParam({ name: 'id', description: 'Profile photo id' })
  @ApiOkEnvelope(ProfilePhotoDto)
  @ApiNotFoundEnvelope(ERROR_CODE.PHOTO_NOT_FOUND, 'Not one of your photos.', 'Rasm topilmadi')
  async makeMain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProfilePhotoDto> {
    return ProfilePhotoDto.fromDomain(await this.photos.makeMain(user, id));
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a photo',
    description:
      'Deleting the current avatar promotes the next photo in the set; deleting the last one ' +
      'clears `avatarUrl` and the client falls back to initials.',
  })
  @ApiParam({ name: 'id', description: 'Profile photo id' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(ERROR_CODE.PHOTO_NOT_FOUND, 'Not one of your photos.', 'Rasm topilmadi')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.photos.remove(user, id);
  }
}
