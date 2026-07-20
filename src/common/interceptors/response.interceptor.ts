import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseResponse } from '../http/base-response';

/**
 * Wraps every successful controller return value in the BaseResponse envelope.
 * Controllers return the raw payload (object/array/pagination) — never wrap manually.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, BaseResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<BaseResponse<T>> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((result) => ({
        success: true,
        status: res.statusCode ?? 200,
        code: null,
        message: 'OK',
        result: result ?? null,
        error: null,
      })),
    );
  }
}
