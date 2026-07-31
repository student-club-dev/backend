import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { StudentSummaryDto } from '../../../connections/presentation/dto/student-summary.dto';
import {
  MAX_STORY_CAPTION_LENGTH,
  StoryForViewer,
  StoryGroup,
} from '../../domain/entities/story.entity';
import { StoryKind } from '../../domain/enums/story-kind.enum';

/** Body of `POST /v1/stories`. */
export class CreateStoryDto {
  @ApiProperty({
    description:
      'The `id` returned by `POST /v1/media/chat-upload` with `kind=STORY_IMAGE` or ' +
      '`STORY_VIDEO` (no `conversationId`). Single-use.',
  })
  @IsString()
  @IsNotEmpty()
  mediaId!: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: MAX_STORY_CAPTION_LENGTH,
    example: 'Imtihon tugadi 🎓',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_STORY_CAPTION_LENGTH)
  caption?: string;
}

/** One story on the wire. */
export class StoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  authorId!: string;

  @ApiProperty({ enum: StoryKind, enumName: 'StoryKindDto' })
  kind!: StoryKind;

  @ApiProperty({ description: 'Requires the same bearer token as any other call.' })
  url!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbUrl!: string | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  width!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  height!: number | null;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    nullable: true,
    description: 'Video only. `null` for an image — show those for a fixed few seconds instead.',
  })
  durationMs!: number | null;

  @ApiProperty({ type: String, nullable: true, maxLength: MAX_STORY_CAPTION_LENGTH })
  caption!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: '24 hours after `createdAt`. Past this the story is gone from every response.',
  })
  expiresAt!: string;

  @ApiProperty({
    description: 'Whether **you** have opened it. Always `true` on your own stories.',
  })
  seen!: boolean;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    nullable: true,
    description:
      'The real count on **your own** stories; `null` on everyone else’s. Someone else’s view ' +
      'count would let you measure the size of their network.',
  })
  viewsCount!: number | null;

  static fromDomain(entry: StoryForViewer): StoryDto {
    const dto = new StoryDto();
    dto.id = entry.story.id;
    dto.authorId = entry.story.authorId;
    dto.kind = entry.story.kind;
    dto.url = entry.story.url;
    dto.thumbUrl = entry.story.thumbUrl;
    dto.width = entry.story.width;
    dto.height = entry.story.height;
    dto.durationMs = entry.story.durationMs;
    dto.caption = entry.story.caption;
    dto.createdAt = entry.story.createdAt.toISOString();
    dto.expiresAt = entry.story.expiresAt.toISOString();
    dto.seen = entry.seen;
    dto.viewsCount = entry.viewsCount;
    return dto;
  }
}

/** One author's live stories, as the feed groups them. */
export class StoryGroupDto {
  @ApiProperty({ type: () => StudentSummaryDto })
  author!: StudentSummaryDto;

  @ApiProperty({ type: [StoryDto], description: 'Oldest first — play them in this order.' })
  stories!: StoryDto[];

  @ApiProperty({
    description: 'Any unseen story in this group. This is what lights the ring around the avatar.',
  })
  hasUnseen!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  lastCreatedAt!: string;

  static fromDomain(group: StoryGroup): StoryGroupDto {
    const dto = new StoryGroupDto();
    dto.author = StudentSummaryDto.fromDomain(group.author);
    dto.stories = group.stories.map(StoryDto.fromDomain);
    dto.hasUnseen = group.hasUnseen;
    dto.lastCreatedAt = group.lastCreatedAt.toISOString();
    return dto;
  }
}

/** The story feed. */
export class StoryFeedDto {
  @ApiProperty({
    type: [StoryGroupDto],
    description:
      'Already ordered: authors with something unseen first, then by most recent story. Draw the ' +
      'avatar row in exactly this order — do not re-sort it.',
  })
  items!: StoryGroupDto[];

  static from(groups: StoryGroup[]): StoryFeedDto {
    const dto = new StoryFeedDto();
    dto.items = groups.map(StoryGroupDto.fromDomain);
    return dto;
  }
}

/** The caller's own live stories. */
export class MyStoriesDto {
  @ApiProperty({ type: [StoryDto], description: 'Oldest first. Expired ones are not returned.' })
  items!: StoryDto[];

  static from(entries: StoryForViewer[]): MyStoriesDto {
    const dto = new MyStoriesDto();
    dto.items = entries.map(StoryDto.fromDomain);
    return dto;
  }
}
