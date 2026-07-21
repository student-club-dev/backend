import { ApiProperty } from '@nestjs/swagger';
import { MediaUploadResult } from '../../application/media.io';

/** MediaUploadResponseDto — matches elon-uz.json. `thumbUrl`/`cardUrl` are null in v1 (deferred). */
export class MediaUploadResponseDto {
  @ApiProperty({
    description: 'Full-size image URL',
    example: 'http://localhost:3000/uploads/LISTING/8f14e45f-ceea-467d-9a3e-1a2b3c4d5e6f.jpg',
  })
  url!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: '200px variant — always null in v1 (deferred)',
  })
  thumbUrl!: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: '800px variant — always null in v1 (deferred)',
  })
  cardUrl!: string | null;

  static from(result: MediaUploadResult): MediaUploadResponseDto {
    const dto = new MediaUploadResponseDto();
    dto.url = result.url;
    dto.thumbUrl = result.thumbUrl;
    dto.cardUrl = result.cardUrl;
    return dto;
  }
}
