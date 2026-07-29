import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-only mirrors of the runtime envelope in `common/http/base-response.ts`.
 * They exist so the generated spec shows what the API actually returns — the runtime shape is
 * produced by ResponseInterceptor / AllExceptionsFilter and is not affected by these classes.
 *
 * `result` is deliberately NOT declared here: every response documents its own payload type via
 * the `allOf` overlay built in `api-envelope.decorator.ts`, which keeps the composed schema free
 * of conflicting `result` definitions.
 */
export class ApiErrorDto {
  @ApiProperty({
    type: String,
    example: 'BUSINESS_NOT_FOUND',
    nullable: true,
    description: 'Machine-readable error code — switch on this, not on `message`.',
  })
  code!: string | null;

  @ApiProperty({
    type: String,
    example: 'Biznes topilmadi',
    nullable: true,
    description: 'User-facing Uzbek text, safe to show directly.',
  })
  message!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Per-field validation messages. Filled on 422, empty object otherwise.',
    example: {},
  })
  fields!: Record<string, string>;
}

export class BaseResponseDto {
  @ApiProperty({ example: true, description: 'False on every error response.' })
  success!: boolean;

  @ApiProperty({ example: 200, description: 'Always equal to the HTTP status code.' })
  status!: number;

  @ApiProperty({
    type: String,
    example: null,
    nullable: true,
    description: 'Reserved; currently always null.',
  })
  code!: string | null;

  @ApiProperty({
    type: String,
    example: 'OK',
    nullable: true,
    description: 'User-facing Uzbek text.',
  })
  message!: string | null;

  @ApiProperty({
    type: ApiErrorDto,
    nullable: true,
    description: 'Null on success, filled on error.',
  })
  error!: ApiErrorDto | null;
}
