import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AppException } from '../exceptions/app.exception';
import { ERROR_CODE } from '../errors/error-code';
import { BaseResponse } from '../http/base-response';

/**
 * Catches everything and renders the BaseResponse error envelope.
 * HTTP status code and the `status` field are kept equal. `message` is user-facing (Uzbek).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODE.INTERNAL_ERROR;
    let message = 'Serverda xatolik yuz berdi';
    let fields: Record<string, string> = {};

    if (exception instanceof AppException) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = this.codeForStatus(status);
      message = this.extractMessage(exception.getResponse()) ?? message;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    if (status >= 500) {
      this.logger.error(`${code}: ${message}`);
    }

    const body: BaseResponse<null> = {
      success: false,
      status,
      code,
      message,
      result: null,
      error: { code, message, fields },
    };
    res.status(status).json(body);
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 401:
        return ERROR_CODE.UNAUTHORIZED;
      case 403:
        return ERROR_CODE.FORBIDDEN;
      case 404:
        return ERROR_CODE.NOT_FOUND;
      case 409:
        return ERROR_CODE.INVALID_STATUS_TRANSITION;
      case 413:
        // Multer's LIMIT_FILE_SIZE surfaces as a bare PayloadTooLargeException — render it as
        // FILE_TOO_LARGE so the /media/upload contract holds even when the interceptor limit fires.
        return ERROR_CODE.FILE_TOO_LARGE;
      case 422:
        return ERROR_CODE.VALIDATION_ERROR;
      case 429:
        return ERROR_CODE.RATE_LIMITED;
      default:
        return status >= 500 ? ERROR_CODE.INTERNAL_ERROR : 'ERROR';
    }
  }

  private extractMessage(resp: string | object): string | null {
    if (typeof resp === 'string') return resp;
    if (resp && typeof resp === 'object' && 'message' in resp) {
      const m = (resp as { message: unknown }).message;
      if (typeof m === 'string') return m;
      if (Array.isArray(m)) return m.join(', ');
    }
    return null;
  }
}
