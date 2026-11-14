import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import {
  type ApiSuccessResponse,
  DEFAULT_SUCCESS_MESSAGE,
  PaginatedResult,
  RESPONSE_MESSAGE_KEY,
  SKIP_ENVELOPE_KEY,
} from './api-response';

/** Envuelve una sola vez los éxitos de los controladores de Auth. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, targets))
      return next.handle();

    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, targets) ??
      DEFAULT_SUCCESS_MESSAGE;
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((result: unknown): ApiSuccessResponse<unknown> => {
        const statusCode = response.statusCode;
        if (result instanceof PaginatedResult)
          return {
            error: false,
            statusCode,
            message,
            data: result.items,
            meta: result.meta,
          };
        return { error: false, statusCode, message, data: result ?? null };
      }),
    );
  }
}
