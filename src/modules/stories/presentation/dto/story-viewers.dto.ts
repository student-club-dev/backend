import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { StudentSummaryDto } from '../../../connections/presentation/dto/student-summary.dto';
import { StoryViewerPage } from '../../domain/story.repository';

/** Query for `GET /v1/stories/{id}/views`. */
export class StoryViewersQueryDto {
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

/** Who has seen a story, most recent first. */
export class StoryViewerPageDto {
  @ApiProperty({ type: [StudentSummaryDto], description: 'Most recent viewer first.' })
  items!: StudentSummaryDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(result: StoryViewerPage, page: number, size: number): StoryViewerPageDto {
    const dto = new StoryViewerPageDto();
    dto.items = result.items.map(StudentSummaryDto.fromDomain);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
