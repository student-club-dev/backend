import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** The cap on one request (§3.5). Past this the client should send `all` instead. */
export const MARK_READ_MAX_IDS = 200;

@ValidatorConstraint({ name: 'isValidMarkReadMode', async: false })
class IsValidMarkReadModeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value !== undefined && typeof value !== 'boolean') {
      return false;
    }
    const body = args.object as MarkNotificationsReadDto;
    return (body.ids !== undefined) !== (value === true);
  }

  defaultMessage(args: ValidationArguments): string {
    if (args.value !== undefined && typeof args.value !== 'boolean') {
      return '`all` — true yoki false bo‘lishi kerak';
    }
    return 'Yo‘ `ids`, yo‘ `all: true` yuboring — ikkalasi birga ham, ikkalasisiz ham bo‘lmaydi';
  }
}

/**
 * Checks the whole mode selection, `all`'s own type included, from one constraint on one property.
 *
 * Splitting it would not work. A property carries either all of its validators or none: both
 * `@IsOptional()` and `@ValidateIf` suppress every validator on the property they guard, and the
 * case this rule exists to catch — an empty body, where `all` is undefined — is exactly the case
 * they suppress. So `all` gets no `@IsOptional()`, and "undefined is acceptable here" is folded
 * into this validator instead of being delegated to one that would silence it.
 */
function IsValidMarkReadMode(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidMarkReadModeConstraint,
    });
  };
}

/**
 * Body of `POST /v1/notifications/read` (§3). One endpoint covers both shapes:
 *
 *   `{ "ids": ["ntf_…", "ntf_…"] }`   — these rows
 *   `{ "all": true }`                 — everything unread
 *
 * Exactly one of the two, never both and never neither (§3.1).
 */
export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    type: [String],
    maxItems: MARK_READ_MAX_IDS,
    example: ['ntf_01HX2E4Q7Z', 'ntf_01HW9B3K2M'],
    description:
      `The rows to mark, at most ${MARK_READ_MAX_IDS}. Ids that are unknown, or belong to another ` +
      'student, are skipped silently rather than failing the batch (§3.3) — one stale id from the ' +
      'client’s cache must not cost the others their mark.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MARK_READ_MAX_IDS, {
    message: `Bir so‘rovda ko‘pi bilan ${MARK_READ_MAX_IDS} ta bildirishnoma`,
  })
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({
    type: Boolean,
    example: true,
    description: 'Marks every unread notification. Mutually exclusive with `ids`.',
  })
  @IsValidMarkReadMode()
  all?: boolean;
}
