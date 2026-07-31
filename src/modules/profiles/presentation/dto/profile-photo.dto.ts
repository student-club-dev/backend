import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { ProfilePhoto } from '../../domain/entities/profile-photo.entity';

/** Body of `POST /v1/profile/photos`. */
export class AddProfilePhotoDto {
  @ApiProperty({
    description:
      'The `id` returned by `POST /v1/media/chat-upload` with `kind=PROFILE_PHOTO`. Single-use: ' +
      'one asset belongs to one photo.',
  })
  @IsString()
  @IsNotEmpty()
  mediaId!: string;
}

/** One picture in the profile-photo set. */
export class ProfilePhotoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    description: 'Full-size image. Requires the same bearer token as any other call.',
  })
  url!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbUrl!: string | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  width!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  height!: number | null;

  static fromDomain(photo: ProfilePhoto): ProfilePhotoDto {
    const dto = new ProfilePhotoDto();
    dto.id = photo.id;
    dto.url = photo.url;
    dto.thumbUrl = photo.thumbUrl;
    dto.width = photo.width;
    dto.height = photo.height;
    return dto;
  }
}

/** The whole set, in display order. */
export class ProfilePhotoListDto {
  @ApiProperty({
    type: [ProfilePhotoDto],
    description:
      'In display order. The first element is always the current avatar and always matches ' +
      '`avatarUrl` — that field is derived from this one, not stored separately.',
  })
  items!: ProfilePhotoDto[];

  static from(photos: ProfilePhoto[]): ProfilePhotoListDto {
    const dto = new ProfilePhotoListDto();
    dto.items = photos.map(ProfilePhotoDto.fromDomain);
    return dto;
  }
}
