import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/** Shared pagination query — absent `page`/`size` default to 1/20 in the controller. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

/** Query for `GET /v1/students/search`. */
export class SearchQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Matched against username (prefix) or full name (contains)' })
  @IsString()
  @IsNotEmpty()
  q!: string;
}

/** Query for `GET /v1/connections/requests`. */
export class RequestsQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: ['incoming', 'outgoing'] })
  @IsIn(['incoming', 'outgoing'])
  direction!: 'incoming' | 'outgoing';
}

/** Query for `GET /v1/connections`. */
export class ConnectionsQueryDto extends PaginationQueryDto {}
