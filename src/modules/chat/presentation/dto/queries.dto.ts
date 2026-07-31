import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DeleteScope } from '../../domain/enums/delete-scope.enum';

/** `?scope=` on the delete routes. Omitted means `EVERYONE`, which is what they did before it existed. */
export class ScopeQueryDto {
  @ApiPropertyOptional({ enum: DeleteScope, enumName: 'DeleteScopeDto' })
  @IsOptional()
  @IsEnum(DeleteScope)
  scope?: DeleteScope;
}

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

  @ApiPropertyOptional({
    description:
      'Jump target: the window centred on this `seq` — roughly half before it, the rest from it ' +
      'onwards. Mutually exclusive with `before` and `after` (422). Use it when a tapped quote ' +
      'points at a message too far back to be in the local cache (§C3). `hasMore` then reports ' +
      'whether *older* messages exist below the window, which is the direction you scroll next.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  around?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}
