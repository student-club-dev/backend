import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MediaProvider } from '../../../media/domain/enums/media-kind.enum';
import { DeleteScope } from '../../domain/enums/delete-scope.enum';
import { MessageType } from '../../domain/enums/message-type.enum';

/** Body of `POST /v1/conversations` — open (or fetch) a direct conversation with a connection. */
export class OpenDirectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

/**
 * A GIF picked from `GET /v1/gifs/search`. Sent instead of `mediaId`: provider terms forbid
 * re-hosting, so we reference their CDN rather than copying the file.
 */
export class GifRefDto {
  @ApiProperty({ enum: MediaProvider, enumName: 'MediaProviderDto' })
  @IsEnum(MediaProvider)
  provider!: MediaProvider;

  @ApiProperty({ description: 'The search result `id`.' })
  @IsString()
  @IsNotEmpty()
  externalId!: string;

  @ApiProperty({ description: 'Provider CDN url. Checked against a host allowlist.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  thumbUrl!: string;

  @ApiProperty({ type: 'integer', format: 'int32' })
  @IsInt()
  @Min(1)
  width!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  @IsInt()
  @Min(1)
  height!: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}

/**
 * A sticker picked from `GET /v1/stickers/search`. Sent instead of `stickerId`, which only names a
 * row in our own seeded catalogue — a provider sticker has no such row, and provider terms forbid
 * copying the file to get one.
 */
export class StickerRefDto {
  @ApiProperty({ enum: MediaProvider, enumName: 'MediaProviderDto' })
  @IsEnum(MediaProvider)
  provider!: MediaProvider;

  @ApiProperty({ description: 'The search result `id`.' })
  @IsString()
  @IsNotEmpty()
  externalId!: string;

  @ApiProperty({ description: 'Provider CDN url. Checked against a host allowlist.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  thumbUrl!: string;

  @ApiProperty({ type: 'integer', format: 'int32' })
  @IsInt()
  @Min(1)
  width!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  @IsInt()
  @Min(1)
  height!: number;
}

/** The fragment of the target the user highlighted before hitting reply (§C1). */
export class QuoteInputDto {
  @ApiProperty({
    maxLength: 300,
    description:
      'Max 300 characters (422 `QUOTE_TOO_LONG`). Must be a real slice of the target’s body at `offset` — the server checks it and rejects a ' +
      'mismatch with 422 `QUOTE_NOT_FOUND`. It is stored as a snapshot, so an unchecked one would ' +
      'render forever as text the original never contained.',
  })
  // Length is checked in the domain: the contract names `QUOTE_TOO_LONG`, and a DTO rule would
  // answer `VALIDATION_ERROR` over REST while the WS path still answered `QUOTE_TOO_LONG`.
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    minimum: 0,
    description:
      'Start of the selection in UTF-16 code units. Kotlin and Swift already count in these, so ' +
      'pass the index straight through — no conversion on either side.',
  })
  @IsInt()
  @Min(0)
  offset!: number;
}

/** Body of `POST /v1/conversations/:id/messages`. */
export class SendMessageDto {
  @ApiPropertyOptional({
    type: String,
    description:
      'Reply to this message. It must live in the same conversation (422 ' +
      '`REPLY_TARGET_NOT_FOUND`) and must not be deleted (422 `REPLY_TARGET_DELETED`).',
  })
  @IsOptional()
  @IsString()
  replyToMessageId?: string;

  @ApiPropertyOptional({
    type: () => QuoteInputDto,
    description:
      'Quote a fragment of the target instead of the whole message. Never valid on its own — ' +
      'without `replyToMessageId` it is 422 `QUOTE_WITHOUT_REPLY`. Text messages only: media has ' +
      'no body to slice.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteInputDto)
  quote?: QuoteInputDto;

  @ApiPropertyOptional({
    enum: MessageType,
    enumName: 'MessageTypeDto',
    description:
      'Omit for a plain text message — that is what an older client sends, and it keeps working. ' +
      '`SYSTEM` and `CALL` are server-only and rejected here.',
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
    type: () => GifRefDto,
    description:
      'For a `GIF` taken from search. Use this **or** `mediaId` (an uploaded GIF), not both.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GifRefDto)
  gif?: GifRefDto;

  @ApiPropertyOptional({
    type: String,
    description:
      'For a `STICKER` from our own catalogue — an id from `GET /v1/stickers/packs`. Use this ' +
      '**or** `sticker`, never both (422 `STICKER_SOURCE_AMBIGUOUS`); a `STICKER` message needs ' +
      'exactly one of them.',
  })
  @IsOptional()
  @IsString()
  stickerId?: string;

  @ApiPropertyOptional({
    type: () => StickerRefDto,
    description:
      'For a `STICKER` taken from `GET /v1/stickers/search` — pass the search result back ' +
      'verbatim. Use this **or** `stickerId`, never both. The response renders both sources as the ' +
      'same `MessageDto.sticker`, so nothing downstream has to tell them apart.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StickerRefDto)
  sticker?: StickerRefDto;

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

/**
 * Body of `POST /v1/messages/delete` (§A2). The 100-id ceiling lives in the service, not in
 * `@ArrayMaxSize` — the contract names `TOO_MANY_IDS`, not `VALIDATION_ERROR`.
 */
export class DeleteMessagesDto {
  @ApiProperty({
    type: [String],
    description:
      'Message ids, 1–100, all from the same conversation (422 `MIXED_CONVERSATIONS` otherwise). ' +
      'Duplicates are collapsed. Ids that do not exist come back in `skipped` rather than failing ' +
      'the batch.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({
    enum: DeleteScope,
    enumName: 'DeleteScopeDto',
    description:
      '`EVERYONE` deletes for both members and is allowed only on your own messages — anyone ' +
      'else’s land in `skipped` as `NOT_OWN`. `ME` hides the message on every device you own and ' +
      'leaves it untouched for the other member, so it works on any message in the conversation.',
  })
  @IsEnum(DeleteScope)
  scope!: DeleteScope;
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
