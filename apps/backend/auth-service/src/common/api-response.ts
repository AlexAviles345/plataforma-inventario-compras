import { SetMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const RESPONSE_MESSAGE_KEY = 'auth:response-message';
export const SKIP_ENVELOPE_KEY = 'auth:skip-envelope';
export const DEFAULT_SUCCESS_MESSAGE = 'Operación completada exitosamente';
export const MAX_PAGE_LIMIT = 100;

/** Mensaje humano que acompaña la respuesta exitosa del endpoint. */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

/** Excluye el endpoint de la envoltura (health, archivos, streams). */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  error: false;
  statusCode: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/** Resultado que el interceptor transforma en `data` + `meta`. */
export class PaginatedResult<T> {
  readonly meta: PaginationMeta;

  constructor(
    readonly items: T[],
    page: number,
    limit: number,
    total: number,
  ) {
    this.meta = buildPaginationMeta(page, limit, total);
  }
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe ser un número entero' })
  @Min(1, { message: 'Debe ser mayor o igual a 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe ser un número entero' })
  @Min(1, { message: `Debe estar entre 1 y ${MAX_PAGE_LIMIT}` })
  @Max(MAX_PAGE_LIMIT, { message: `Debe estar entre 1 y ${MAX_PAGE_LIMIT}` })
  limit: number = 20;
}
