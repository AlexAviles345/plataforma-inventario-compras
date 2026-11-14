import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  type ApiErrorResponse,
  AuthDomainError,
  ErrorCode,
  type ErrorDetail,
} from './errors';
import { currentRequestId } from './request-context';

interface MappedError {
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
  headers?: Record<string, string>;
}

const KNOWN_STATUS: Record<number, { code: string; message: string }> = {
  400: {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'La solicitud contiene datos inválidos',
  },
  401: {
    code: ErrorCode.AUTHENTICATION_REQUIRED,
    message: 'Se requiere autenticación para acceder a este recurso',
  },
  403: {
    code: ErrorCode.FORBIDDEN,
    message: 'No cuenta con permisos para realizar esta operación',
  },
  404: {
    code: ErrorCode.RESOURCE_NOT_FOUND,
    message: 'El recurso solicitado no existe',
  },
  405: {
    code: ErrorCode.METHOD_NOT_ALLOWED,
    message: 'Método HTTP no permitido para este endpoint',
  },
  413: {
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    message: 'El cuerpo de la solicitud excede el límite permitido',
  },
  429: {
    code: ErrorCode.RATE_LIMITED,
    message: 'Se ha excedido el límite de solicitudes permitidas',
  },
};

const INTERNAL: MappedError = {
  statusCode: 500,
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Ocurrió un error interno al procesar la solicitud',
};

/** Errores de body-parser: traen `type` y `status` propios. */
function isBodyParserError(
  exception: unknown,
): exception is { type: string; status: number } {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    typeof (exception as { type?: unknown }).type === 'string' &&
    typeof (exception as { status?: unknown }).status === 'number'
  );
}

function fromStatus(statusCode: number): MappedError {
  if (statusCode >= 500) return INTERNAL;
  const known = KNOWN_STATUS[statusCode];
  if (known) return { statusCode, ...known };
  // Código estable derivado del nombre del status: 409 → CONFLICT, 415 → UNSUPPORTED_MEDIA_TYPE.
  const name = HttpStatus[statusCode] as string | undefined;
  return {
    statusCode,
    code: name ?? 'REQUEST_ERROR',
    message: 'No fue posible procesar la solicitud',
  };
}

export function mapException(exception: unknown): MappedError {
  if (exception instanceof AuthDomainError)
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      headers: exception.headers,
    };
  if (isBodyParserError(exception)) {
    if (exception.type === 'entity.parse.failed')
      return {
        statusCode: 400,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'El cuerpo JSON de la solicitud es inválido',
      };
    return fromStatus(exception.status);
  }
  if (exception instanceof HttpException)
    return fromStatus(exception.getStatus());
  return INTERNAL;
}

/**
 * Normaliza cualquier excepción al contrato de error común con `source: "auth"`.
 * Los mensajes de excepciones internas nunca llegan al cliente.
 */
@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly options: { log: boolean }) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = mapException(exception);

    if (mapped.statusCode >= 500 && this.options.log) {
      console.error(
        JSON.stringify({
          service: 'auth-service',
          type: 'error',
          requestId: currentRequestId(),
          error: exception instanceof Error ? exception.name : typeof exception,
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    if (response.headersSent) {
      response.destroy();
      return;
    }

    const body: ApiErrorResponse = {
      error: true,
      statusCode: mapped.statusCode,
      code: mapped.code,
      message: mapped.message,
      source: 'auth',
      timestamp: new Date().toISOString(),
    };
    if (mapped.details?.length) body.details = mapped.details;

    for (const [name, value] of Object.entries(mapped.headers ?? {}))
      response.setHeader(name, value);
    response.status(mapped.statusCode).json(body);
  }
}
