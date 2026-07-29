import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Body of `POST /v1/conversations` — open (or fetch) a direct conversation with a connection. */
export class OpenDirectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

/** Body of `POST /v1/conversations/:id/messages`. */
export class SendMessageDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;

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
