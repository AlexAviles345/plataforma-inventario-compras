import type { ErrorCode } from './error-codes.types';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FieldErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiSuccessResponse<T> {
  error: false;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export type ApiErrorSource = 'gateway' | 'auth' | 'inventory' | 'purchases';

export interface ApiErrorResponse {
  error: true;
  statusCode: number;
  code: ErrorCode | (string & {});
  message: string;
  source: ApiErrorSource;
  timestamp: string;
  details?: FieldErrorDetail[];
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface ApiResponseWithRequestId<T> {
  response: ApiSuccessResponse<T>;
  requestId?: string;
}
