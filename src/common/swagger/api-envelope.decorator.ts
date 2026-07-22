import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import type {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ERROR_CODE } from '../errors/error-code';
import { ApiErrorDto, BaseResponseDto } from './base-response.dto';

/**
 * Response-envelope decorators. Every endpoint returns `BaseResponse` (see CLAUDE.md
 * "API Contract & Response Envelope"), so documenting the bare DTO would describe a body the API
 * never sends. These compose `BaseResponse` + the endpoint's payload into one schema.
 *
 * Usage mirrors the plain Swagger decorators they replace:
 *   `@ApiOkEnvelope(BusinessDto)`      → 200, `result` is a BusinessDto
 *   `@ApiOkEnvelope([BusinessDto])`    → 200, `result` is a BusinessDto array
 *   `@ApiOkEnvelope()`                 → 200, `result` is null
 *   `@ApiCreatedEnvelope(BusinessDto)` → 201, `result` is a BusinessDto
 *
 * Documentation only — these emit no runtime behaviour.
 */
type ResultModel = Type<unknown> | [Type<unknown>];

function unwrap(model: ResultModel): Type<unknown> {
  return Array.isArray(model) ? model[0] : model;
}

/** `result` for a success response: a $ref, an array of $ref, or null when there is no payload. */
function resultSchema(model?: ResultModel): SchemaObject | ReferenceObject {
  if (model === undefined) {
    return { nullable: true, example: null, description: 'No payload for this endpoint.' };
  }
  const ref: ReferenceObject = { $ref: getSchemaPath(unwrap(model)) };
  return Array.isArray(model) ? { type: 'array', items: ref } : ref;
}

function successSchema(model?: ResultModel): SchemaObject {
  return {
    allOf: [
      { $ref: getSchemaPath(BaseResponseDto) },
      { type: 'object', properties: { result: resultSchema(model) } },
    ],
  };
}

function errorSchema(errorCode: string, status: number, message: string): SchemaObject {
  return {
    allOf: [
      { $ref: getSchemaPath(BaseResponseDto) },
      {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          status: { type: 'integer', example: status },
          message: { type: 'string', example: message },
          result: { nullable: true, example: null },
          error: {
            allOf: [{ $ref: getSchemaPath(ApiErrorDto) }],
            example: { code: errorCode, message, fields: {} },
          },
        },
      },
    ],
  };
}

function successEnvelope(
  status: number,
  defaultDescription: string,
  model?: ResultModel,
  description?: string,
): MethodDecorator & ClassDecorator {
  const models = model === undefined ? [] : [unwrap(model)];
  return applyDecorators(
    ApiExtraModels(BaseResponseDto, ApiErrorDto, ...models),
    ApiResponse({
      status,
      description: description ?? defaultDescription,
      schema: successSchema(model),
    }),
  );
}

/** 200 — `result` holds the payload (or null when `model` is omitted). */
export function ApiOkEnvelope(
  model?: ResultModel,
  description?: string,
): MethodDecorator & ClassDecorator {
  return successEnvelope(200, 'OK', model, description);
}

/** 201 — resource created; `result` holds the payload. */
export function ApiCreatedEnvelope(
  model?: ResultModel,
  description?: string,
): MethodDecorator & ClassDecorator {
  return successEnvelope(201, 'Created', model, description);
}

/**
 * Error response in the same envelope. `errorCode` is the value of `error.code`; `message` is the
 * user-facing Uzbek example shown in the docs.
 */
export function ApiErrorEnvelope(
  status: number,
  errorCode: string,
  description: string,
  message = 'Xatolik yuz berdi',
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(BaseResponseDto, ApiErrorDto),
    ApiResponse({ status, description, schema: errorSchema(errorCode, status, message) }),
  );
}

/**
 * 401 — missing/invalid token (`UNAUTHORIZED`) or an expired one (`TOKEN_EXPIRED`, the client
 * should refresh and retry). Apply at controller level: it holds for every guarded route.
 */
export function ApiUnauthorizedEnvelope(): MethodDecorator & ClassDecorator {
  return ApiErrorEnvelope(
    401,
    ERROR_CODE.UNAUTHORIZED,
    'Missing or invalid access token (`UNAUTHORIZED`), or expired (`TOKEN_EXPIRED`) — refresh and retry.',
    'Avtorizatsiyadan o‘tilmagan',
  );
}

/** 403 — authenticated but not allowed (wrong account type, or someone else's resource). */
export function ApiForbiddenEnvelope(
  description = 'Wrong account type, or the resource belongs to another owner.',
): MethodDecorator & ClassDecorator {
  return ApiErrorEnvelope(403, ERROR_CODE.FORBIDDEN, description, 'Ruxsat yo‘q');
}

/** 404 — `errorCode` names the missing aggregate, e.g. `BUSINESS_NOT_FOUND`. */
export function ApiNotFoundEnvelope(
  errorCode: string,
  description = 'Resource not found.',
  message = 'Topilmadi',
): MethodDecorator & ClassDecorator {
  return ApiErrorEnvelope(404, errorCode, description, message);
}

/** 422 — request body failed validation; `error.fields` maps field name to an Uzbek message. */
export function ApiValidationEnvelope(
  description = 'Validation failed — see `error.fields`.',
): MethodDecorator & ClassDecorator {
  return ApiErrorEnvelope(422, ERROR_CODE.VALIDATION_ERROR, description, 'Ma’lumotlar noto‘g‘ri');
}
