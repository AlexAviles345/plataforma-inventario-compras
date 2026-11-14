import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AuthDomainError, ErrorCode, type ErrorDetail } from './errors';

const UNKNOWN_FIELD_CONSTRAINT = 'whitelistValidation';

/** `isEmail` → `IS_EMAIL`; campos no declarados → `UNKNOWN_FIELD`. */
function constraintCode(constraint: string): string {
  if (constraint === UNKNOWN_FIELD_CONSTRAINT) return 'UNKNOWN_FIELD';
  return constraint
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
}

function childPath(
  parent: string,
  error: ValidationError,
  parentIsArray: boolean,
) {
  if (parentIsArray) return `${parent}[${error.property}]`;
  return parent ? `${parent}.${error.property}` : error.property;
}

/**
 * Aplana el árbol de class-validator en `details` con rutas JSON del cliente,
 * por ejemplo `assignments[0].role`. Nunca incluye el valor recibido.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
  parentIsArray = false,
): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  for (const error of errors) {
    const field = childPath(parent, error, parentIsArray);
    for (const [constraint, message] of Object.entries(
      error.constraints ?? {},
    )) {
      details.push({
        field,
        code: constraintCode(constraint),
        message:
          constraint === UNKNOWN_FIELD_CONSTRAINT
            ? 'Campo no permitido'
            : message,
      });
    }
    if (error.children?.length) {
      details.push(
        ...flattenValidationErrors(
          error.children,
          field,
          Array.isArray(error.value),
        ),
      );
    }
  }
  return details;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // `value` se necesita para reconocer arrays; no se expone al cliente.
    validationError: { target: false, value: true },
    exceptionFactory: (errors) =>
      new AuthDomainError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'La solicitud contiene datos inválidos',
        flattenValidationErrors(errors),
      ),
  });
}
