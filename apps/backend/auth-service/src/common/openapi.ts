import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  type ReferenceObject,
  type SchemaObject,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

/**
 * Decoradores OpenAPI que describen la envoltura real de
 * docs/standards/api-responses.md, con un ejemplo por cada código de error.
 */

export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
}

export class ErrorDetailDto {
  @ApiProperty({ example: 'assignments[0].role', required: false })
  field?: string;
  @ApiProperty({ example: 'ROLE_NOT_ALLOWED_FOR_SYSTEM' }) code!: string;
  @ApiProperty({
    example: 'Para INVENTORY el rol debe ser uno de: ADMIN, INVENTORY_MANAGER',
  })
  message!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: true }) error!: true;
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'VERSION_CONFLICT' }) code!: string;
  @ApiProperty({ example: 'El recurso fue modificado por otra operación' })
  message!: string;
  @ApiProperty({ enum: ['auth'] }) source!: 'auth';
  @ApiProperty({ example: '2026-11-16T18:30:00.000Z' }) timestamp!: string;
  @ApiProperty({ type: [ErrorDetailDto], required: false })
  details?: ErrorDetailDto[];
}

const JSON_CONTENT = 'application/json';

export function ApiSuccess(options: {
  status: number;
  message: string;
  model?: Type<unknown>;
  isArray?: boolean;
  paginated?: boolean;
  description?: string;
}) {
  const { status, message, model, isArray, paginated } = options;
  const item = model ? { $ref: getSchemaPath(model) } : { type: 'object' };
  const data = isArray || paginated ? { type: 'array', items: item } : item;
  const properties: Record<string, SchemaObject | ReferenceObject> = {
    error: { type: 'boolean', example: false },
    statusCode: { type: 'integer', example: status },
    message: { type: 'string', example: message },
    data,
  };
  const required = ['error', 'statusCode', 'message', 'data'];
  if (paginated) {
    properties.meta = { $ref: getSchemaPath(PaginationMetaDto) };
    required.push('meta');
  }
  return applyDecorators(
    ApiExtraModels(PaginationMetaDto, ...(model ? [model] : [])),
    ApiResponse({
      status,
      description: options.description ?? message,
      content: {
        [JSON_CONTENT]: {
          schema: { type: 'object', required, properties },
        },
      },
    }),
  );
}

export type ErrorExample = [
  status: number,
  code: string,
  message: string,
  details?: { field?: string; code: string; message: string }[],
];

/** Agrupa por status y publica un ejemplo nombrado por cada código. */
export function ApiErrors(...errors: ErrorExample[]) {
  const byStatus = new Map<number, ErrorExample[]>();
  for (const error of errors)
    byStatus.set(error[0], [...(byStatus.get(error[0]) ?? []), error]);

  return applyDecorators(
    ApiExtraModels(ErrorResponseDto, ErrorDetailDto),
    ...[...byStatus].map(([status, examples]) =>
      ApiResponse({
        status,
        description: examples.map(([, code]) => code).join(' | '),
        content: {
          [JSON_CONTENT]: {
            schema: { $ref: getSchemaPath(ErrorResponseDto) },
            examples: Object.fromEntries(
              examples.map(([, code, message, details]) => [
                code,
                {
                  summary: message,
                  value: {
                    error: true,
                    statusCode: status,
                    code,
                    message,
                    source: 'auth',
                    timestamp: '2026-11-16T18:30:00.000Z',
                    ...(details ? { details } : {}),
                  },
                },
              ]),
            ),
          },
        },
      }),
    ),
  );
}

/** Errores comunes de toda ruta protegida por `AdminGuard`. */
export const ADMIN_AUTH_ERRORS: ErrorExample[] = [
  [401, 'AUTHENTICATION_REQUIRED', 'Token no proporcionado'],
  [401, 'INVALID_TOKEN', 'Token inválido o expirado'],
  [403, 'FORBIDDEN', 'Se requiere rol ADMIN para esta operación'],
];
