import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isEmailOrPhoneProvided', async: false })
class IsEmailOrPhoneProvidedConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as { email?: string; phoneNumber?: string };
    return Boolean(object.email) || Boolean(object.phoneNumber);
  }

  defaultMessage(): string {
    return 'Email yoki telefon raqamdan kamida bittasi kerak';
  }
}

/**
 * Class-property validator that passes when the DTO carries a non-empty `email` OR
 * `phoneNumber`. Attach it to an always-present property (e.g. `password`) so it is not
 * skipped by `@IsOptional()` on the identifier fields.
 */
export function IsEmailOrPhoneProvided(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsEmailOrPhoneProvidedConstraint,
    });
  };
}
