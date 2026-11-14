/** Códigos estables del catálogo común más los específicos de Auth. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  /** Auth: el email normalizado ya pertenece a otro usuario. */
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  /** Auth: el cambio dejaría al sistema sin ningún ADMIN activo. */
  LAST_ACTIVE_ADMIN: 'LAST_ACTIVE_ADMIN',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export interface ErrorDetail {
  /** Ruta JSON vista por el cliente, por ejemplo `assignments[0].role`. */
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: true;
  statusCode: number;
  code: string;
  message: string;
  source: 'auth';
  timestamp: string;
  details?: ErrorDetail[];
}

/**
 * Error de negocio con status, código y mensaje seguros para el cliente.
 * El filtro global lo convierte en la envoltura de error estándar.
 */
export class AuthDomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AuthDomainError';
  }
}
