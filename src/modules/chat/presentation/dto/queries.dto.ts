import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query for `GET /v1/conversations` (page/size). */
export class ConversationsQueryDto {
  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

/** Query for `GET /v1/conversations/:id/messages` — scroll-up (`before`) or catch-up (`after`). */
export class HistoryQueryDto {
  @ApiPropertyOptional({ description: 'Return messages with seq < before (omit for the latest)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({
    description: 'Reconnect catch-up: messages with seq > after, oldest-first (C6)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}
