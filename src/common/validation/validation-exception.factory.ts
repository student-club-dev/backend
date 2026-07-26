import { ValidationError } from 'class-validator';
import { ERROR_CODE } from '../errors/error-code';
import { AppException } from '../exceptions/app.exception';

/**
 * Turns class-validator errors into the contract's 422 shape: `VALIDATION_ERROR` plus one
 * user-facing message per field, keyed by its dotted path (`geo.radiusMeters`, `groupKeys`).
 *
 * Shared by `main.ts` and the e2e suites so tests exercise the real behaviour — the default
 * pipe raises a 400 with a different body.
 */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const fields: Record<string, string> = {};
  const walk = (errs: ValidationError[], prefix = ''): void => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) {
        fields[path] = Object.values(e.constraints)[0];
      }
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(errors);
  return new AppException(ERROR_CODE.VALIDATION_ERROR, 422, 'Ma’lumotlar noto‘g‘ri', fields);
}
