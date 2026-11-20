import axios, { type AxiosError } from 'axios';

import type {
  ApiErrorResponse,
  ApiErrorSource,
  FieldErrorDetail,
} from '@shared/types/api-envelope.types';
import type { ErrorCode } from '@shared/types/error-codes.types';

interface GatewayApiErrorOptions {
  statusCode: number;
  code: ErrorCode | (string & {});
  source: ApiErrorSource;
  details?: FieldErrorDetail[];
  requestId?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class GatewayApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | (string & {});
  readonly source: ApiErrorSource;
  readonly details?: FieldErrorDetail[];
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: GatewayApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'GatewayApiError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.source = options.source;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiErrorResponse>;

  return (
    candidate.error === true &&
    typeof candidate.statusCode === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.source === 'string'
  );
}

function parseRetryAfter(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export function normalizeGatewayError(error: unknown): GatewayApiError {
  if (error instanceof GatewayApiError) return error;

  if (!axios.isAxiosError(error)) {
    return new GatewayApiError('No fue posible completar la solicitud', {
      statusCode: 0,
      code: 'NETWORK_ERROR',
      source: 'gateway',
      cause: error,
    });
  }

  const axiosError = error as AxiosError<unknown>;
  const body = axiosError.response?.data;
  const requestId = axiosError.response?.headers['x-request-id'] as
    | string
    | undefined;
  const retryAfterSeconds = parseRetryAfter(
    axiosError.response?.headers['retry-after'],
  );

  if (isApiErrorResponse(body)) {
    return new GatewayApiError(body.message, {
      statusCode: body.statusCode,
      code: body.code,
      source: body.source,
      details: body.details,
      requestId,
      retryAfterSeconds,
      cause: error,
    });
  }

  return new GatewayApiError(
    axiosError.response
      ? 'El servidor devolvió una respuesta no reconocida'
      : 'No se pudo establecer comunicación con el API Gateway',
    {
      statusCode: axiosError.response?.status ?? 0,
      code: axiosError.response ? 'INVALID_API_RESPONSE' : 'NETWORK_ERROR',
      source: 'gateway',
      requestId,
      retryAfterSeconds,
      cause: error,
    },
  );
}
