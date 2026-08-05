import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationTargetType } from '../../domain/enums/notification-target-type.enum';
import { NotificationType } from '../../domain/enums/notification-type.enum';
import type { NotificationList } from '../../domain/notification.repository';

/**
 * ⚠️ `type` fields below are documented as plain `string`, never as an OpenAPI `enum`, and that is
 * deliberate (spec §1.1). A generated Kotlin `enum` throws on a value it does not know, so the
 * first time we add a notification kind every deployed app would fail to parse the whole list.
 * As strings, the client falls back to `SYSTEM` for an unknown type and to "navigate nowhere" for
 * an unknown target — adding a row to the catalogue stays a backend-only change.
 *
 * The known values are listed in each description so Swagger readers still see the set.
 */

const TYPE_VALUES = Object.values(NotificationType).join(' | ');
const TARGET_VALUES = Object.values(NotificationTargetType).join(' | ');

/** Where tapping the row goes (§1.2). Not a deep link — the app owns its own routing. */
export class NotificationTargetDto {
  @ApiProperty({
    type: String,
    example: 'CHAT',
    description:
      `One of \`${TARGET_VALUES}\` — as a string, not an enum, so an unrecognised value can be ` +
      'treated as "no destination" instead of breaking the response.',
  })
  type!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'cnv_01HX2E4Q7Z',
    description:
      'The id `type` addresses: `conversationId` for CHAT, `listingId` for LISTING. Null for the ' +
      'target types that name a screen (`CONNECTION_REQUESTS`, `MY_LISTINGS`, `PROFILE`).',
  })
  id!: string | null;
}

/** One row of the list (§2). */
export class NotificationDto {
  @ApiProperty({ example: 'ntf_01HX2E4Q7Z' })
  id!: string;

  @ApiProperty({
    type: String,
    example: 'CHAT',
    description: `One of \`${TYPE_VALUES}\` — a string, not an enum (see §1.1). Drives icon and colour only.`,
  })
  type!: string;

  @ApiProperty({ example: 'Yangi xabar', maxLength: 120 })
  title!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 300,
    example: 'Dilnoza sizga xabar yozdi.',
    description: 'Optional — a row with no body is drawn as a title-only card.',
  })
  body!: string | null;

  // `allOf` + `nullable` rather than `$ref` + `nullable`: in OpenAPI 3.0 any key sitting beside a
  // `$ref` is ignored, so the plain form would generate a non-null type and the client would
  // crash on the first notification that goes nowhere.
  @ApiProperty({
    allOf: [{ $ref: getSchemaPath(NotificationTargetDto) }],
    nullable: true,
    description: 'Null when the row is informational and opens nothing.',
  })
  target!: NotificationTargetDto | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-04T08:00:00.000Z',
    description: 'When it was read, or null. ISO-8601 UTC.',
  })
  readAt!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-04T09:12:33.000Z',
    description:
      'ISO-8601 UTC. Never a pre-rendered "2 hours ago" — that string would freeze at the moment ' +
      'it was written and still read "2 hours ago" the next day (§2.3).',
  })
  createdAt!: string;

  static fromDomain(notification: Notification): NotificationDto {
    const dto = new NotificationDto();
    dto.id = notification.id;
    dto.type = notification.type;
    dto.title = notification.title;
    dto.body = notification.body;
    dto.target =
      notification.target === null
        ? null
        : { type: notification.target.type, id: notification.target.id };
    dto.readAt = notification.readAt?.toISOString() ?? null;
    dto.createdAt = notification.createdAt.toISOString();
    return dto;
  }
}

/**
 * `GET /v1/notifications` payload.
 *
 * Not the platform's `{items, page, size, total, hasNext}` envelope, and not by oversight: this
 * list is capped rather than paged (§2), because notifications are short-lived and nobody scrolls
 * one to the end. Sending pagination keys the client never reads would only invite it to try.
 */
export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    example: 3,
    description:
      'Unread across the student’s **entire** history, not within `items` (§2.2). This is what ' +
      'the dot on the home screen shows, so it must not shrink just because the list was capped.',
  })
  unreadCount!: number;

  static fromDomain(list: NotificationList): NotificationListDto {
    const dto = new NotificationListDto();
    dto.items = list.items.map(NotificationDto.fromDomain);
    dto.unreadCount = list.unreadCount;
    return dto;
  }
}
