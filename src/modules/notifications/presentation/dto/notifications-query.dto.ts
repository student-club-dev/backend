import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Defaults for `GET /v1/notifications` (§2). */
export const NOTIFICATIONS_LIMIT_DEFAULT = 30;
export const NOTIFICATIONS_LIMIT_MAX = 100;

/**
 * Query for `GET /v1/notifications`.
 *
 * A cap, not a page. The list is deliberately unpaginated (§2) — notifications expire after 90 days
 * and nobody scrolls one to the end, so a cursor would be machinery in exchange for nothing.
 */
export class NotificationsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    default: NOTIFICATIONS_LIMIT_DEFAULT,
    minimum: 1,
    maximum: NOTIFICATIONS_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATIONS_LIMIT_MAX, { message: `Eng ko‘pi ${NOTIFICATIONS_LIMIT_MAX} ta` })
  limit?: number;
}
