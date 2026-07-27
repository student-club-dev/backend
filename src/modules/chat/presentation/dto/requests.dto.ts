import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

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
}

/** Body of `POST /v1/conversations/:id/read`. */
export class MarkReadDto {
  @ApiProperty({ description: 'Highest read `seq`' })
  @IsInt()
  @Min(0)
  seq!: number;
}
