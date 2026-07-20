import { ErrorCode, ERROR_CODE } from '../errors/error-code';

/**
 * Domain-level exception. Carries a machine code, HTTP status, a user-facing
 * (Uzbek) message and optional field errors. The global filter maps it to the
 * BaseResponse envelope. Prefer these over `throw new Error()` / raw HttpException.
 */
export class AppException extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AppException';
  }

  static unauthorized(message = 'Qaytadan kiring', code: ErrorCode = ERROR_CODE.UNAUTHORIZED) {
    return new AppException(code, 401, message);
  }

  static forbidden(message = 'Bu amal uchun ruxsat yo‘q') {
    return new AppException(ERROR_CODE.FORBIDDEN, 403, message);
  }

  static notFound(code: ErrorCode, message: string) {
    return new AppException(code, 404, message);
  }

  static validation(fields: Record<string, string>, message = 'Ma’lumotlar noto‘g‘ri') {
    return new AppException(ERROR_CODE.VALIDATION_ERROR, 422, message, fields);
  }

  static conflict(code: ErrorCode, message: string) {
    return new AppException(code, 409, message);
  }
}
