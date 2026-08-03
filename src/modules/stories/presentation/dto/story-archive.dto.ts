import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { StoryArchivePage } from '../../domain/story.repository';
import { StoryDto } from './story.dto';

/** Query for `GET /v1/stories/archive`. */
export class StoryArchiveQueryDto {
  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

/** A page of the caller's expired stories. Same `StoryDto` shape as `/mine`. */
export class StoryArchivePageDto {
  @ApiProperty({
    type: [StoryDto],
    description:
      'Newest first — this is a list, not a playback order, which is why it runs the opposite way ' +
      'to `/mine`. `seen` is always `true` and `expiresAt` is in the past; both are expected.',
  })
  items!: StoryDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(result: StoryArchivePage, page: number, size: number): StoryArchivePageDto {
    const dto = new StoryArchivePageDto();
    dto.items = result.items.map((story) =>
      // Your own archive: seen by construction, and the view count is the frozen real one — it is
      // exactly the number the profile grid draws under each cell.
      StoryDto.fromDomain({ story, seen: true, viewsCount: story.viewsCount }),
    );
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
