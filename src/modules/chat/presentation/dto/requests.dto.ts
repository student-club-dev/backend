import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MessageType } from '../../domain/enums/message-type.enum';

/** Body of `POST /v1/conversations` — open (or fetch) a direct conversation with a connection. */
export class OpenDirectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

/** Body of `POST /v1/conversations/:id/messages`. */
export class SendMessageDto {
  @ApiPropertyOptional({
    enum: MessageType,
    enumName: 'MessageTypeDto',
    description:
      'Omit for a plain text message — that is what an older client sends, and it keeps working. ' +
      '`SYSTEM` is server-only and rejected here.',
  })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @ApiPropertyOptional({
    type: String,
    maxLength: 4000,
    description:
      'Required for `TEXT` (1–4000). An optional caption (≤1024) for `IMAGE`/`VIDEO`/`FILE`. ' +
      'Rejected for `GIF`/`VOICE`/`STICKER` — there is nowhere to render it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'The id returned by `POST /v1/media/chat-upload`. Required for `IMAGE`, `VIDEO`, `VOICE`, ' +
      '`FILE` and an uploaded `GIF`. Single-use: an attachment belongs to one message.',
  })
  @IsOptional()
  @IsString()
  mediaId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Client-generated id shared by every image of one multi-image send (max 10). Each image is ' +
      'still its own message with its own `seq`; this only tells the client to draw them as a grid.',
  })
  @IsOptional()
  @IsString()
  albumId?: string;

  @ApiPropertyOptional({
    description: 'Client-generated id — makes a retried send idempotent (C6)',
  })
  @IsOptional()
  @IsString()
  clientMsgId?: string;
}

/** Body of `POST /v1/conversations/:id/read`. */
export class MarkReadDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 0, description: 'Highest read `seq`' })
  @IsInt()
  @Min(0)
  seq!: number;
}

/** Body of `POST /v1/conversations/:id/delivered` — the REST twin of the `message:delivered` event. */
export class MarkDeliveredDto {
  @ApiProperty({
    type: 'integer',
    format: 'int32',
    minimum: 0,
    description: 'Highest delivered `seq`',
  })
  @IsInt()
  @Min(0)
  seq!: number;
}
