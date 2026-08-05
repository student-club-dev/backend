import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MAX_NOTIFICATION_RECIPIENTS,
  SYSTEM_NOTIFICATION_KINDS,
  type SystemNotificationKind,
} from '../../application/admin-notifications.service';

/** Body of `POST /v1/admin/notifications` (push catalogue §3.4 №11/№12). */
export class AdminSendNotificationDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: MAX_NOTIFICATION_RECIPIENTS,
    description:
      `The students to notify, at most ${MAX_NOTIFICATION_RECIPIENTS} per request. Explicit ids ` +
      'rather than a "send to everyone" flag: a broadcast is the one notification nobody can undo, ' +
      'and it should take a deliberate act to build the list.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_NOTIFICATION_RECIPIENTS)
  @IsString({ each: true })
  studentIds!: string[];

  @ApiProperty({ maxLength: 120, example: 'Ilova yangilandi' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  body?: string;

  @ApiPropertyOptional({
    enum: SYSTEM_NOTIFICATION_KINDS,
    default: 'ANNOUNCEMENT',
    description:
      '`ANNOUNCEMENT` opens nothing; `PROFILE` opens the profile screen and is always pushed — it ' +
      'is about the reader’s own account, never marketing.',
  })
  @IsOptional()
  @IsIn(SYSTEM_NOTIFICATION_KINDS)
  kind?: SystemNotificationKind;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Whether an `ANNOUNCEMENT` also reaches the lock screen. **Off by default and deliberately ' +
      'so** (§3.4): a marketing push is how a user comes to switch notifications off altogether, ' +
      'taking their chat and call alerts with them. Ignored for `PROFILE`, which always pushes.',
  })
  @IsOptional()
  @IsBoolean()
  sendPush?: boolean;
}
