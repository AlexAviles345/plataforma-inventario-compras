export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  authenticationRequired: 'AUTHENTICATION_REQUIRED',
  invalidToken: 'INVALID_TOKEN',
  invalidRefreshToken: 'INVALID_REFRESH_TOKEN',
  forbidden: 'FORBIDDEN',
  csrfValidationFailed: 'CSRF_VALIDATION_FAILED',
  resourceNotFound: 'RESOURCE_NOT_FOUND',
  versionConflict: 'VERSION_CONFLICT',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  projectionNotReady: 'PROJECTION_NOT_READY',
  productInactive: 'PRODUCT_INACTIVE',
  orderStateConflict: 'ORDER_STATE_CONFLICT',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  rateLimited: 'RATE_LIMITED',
  internalError: 'INTERNAL_ERROR',
  upstreamUnavailable: 'UPSTREAM_UNAVAILABLE',
  upstreamTimeout: 'UPSTREAM_TIMEOUT',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const knownErrorCodes = new Set<string>(Object.values(ERROR_CODES));

export function isErrorCode(value: string): value is ErrorCode {
  return knownErrorCodes.has(value);
}
