import { fullFormats } from 'ajv-formats/dist/formats';
import {
  ROLES_BY_SYSTEM,
  SYSTEM_CODES,
  type Role,
  type SystemCode,
} from '../access/access-matrix';
import { AuthDomainError, ErrorCode, type ErrorDetail } from '../common/errors';
import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Reglas de dominio de usuarios. Se aplican en el servicio (no solo en los DTO)
 * porque también las usa el bootstrap por CLI, y coinciden con los CHECK de la
 * base y con el JSON Schema de `UserCreated`/`UserUpdated`.
 */

export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MAX_LENGTH = 200;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Mismo formato `email` que valida ajv al construir el evento. */
const EMAIL_FORMAT = fullFormats.email as RegExp;

export interface AssignmentInput {
  system: string;
  role: string;
}

export interface Assignment {
  system: SystemCode;
  role: Role;
}

/** Longitud en caracteres Unicode, igual que `char_length` de PostgreSQL. */
const length = (value: string) => [...value].length;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

export function emailViolations(email: string, field = 'email'): ErrorDetail[] {
  if (length(email) > EMAIL_MAX_LENGTH)
    return [
      {
        field,
        code: 'INVALID_LENGTH',
        message: `Debe tener como máximo ${EMAIL_MAX_LENGTH} caracteres`,
      },
    ];
  if (!EMAIL_FORMAT.test(email))
    return [
      { field, code: 'INVALID_EMAIL', message: 'Debe ser un email válido' },
    ];
  return [];
}

export function displayNameViolations(
  displayName: string,
  field = 'displayName',
): ErrorDetail[] {
  const size = length(displayName);
  if (size < 1 || size > DISPLAY_NAME_MAX_LENGTH)
    return [
      {
        field,
        code: 'INVALID_LENGTH',
        message: `Debe tener entre 1 y ${DISPLAY_NAME_MAX_LENGTH} caracteres`,
      },
    ];
  return [];
}

/**
 * 8 a 128 caracteres, sin recortar espacios, y fuera de la lista de contraseñas
 * comunes. Nunca incluye el valor en el mensaje.
 */
export function passwordViolations(
  password: string,
  field = 'password',
): ErrorDetail[] {
  const size = length(password);
  if (size < PASSWORD_MIN_LENGTH || size > PASSWORD_MAX_LENGTH)
    return [
      {
        field,
        code: 'INVALID_LENGTH',
        message: `Debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres`,
      },
    ];
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || /^(.)\1*$/su.test(password))
    return [
      {
        field,
        code: 'COMMON_PASSWORD',
        message: 'La contraseña es demasiado común; elige otra',
      },
    ];
  return [];
}

/**
 * Valida la matriz rol/sistema y una sola asignación por sistema. Devuelve las
 * asignaciones ordenadas por sistema para que snapshots y comparaciones sean
 * deterministas.
 */
export function validateAssignments(
  input: readonly AssignmentInput[],
  field = 'assignments',
): { assignments: Assignment[]; details: ErrorDetail[] } {
  const details: ErrorDetail[] = [];
  const seen = new Set<string>();
  const assignments: Assignment[] = [];

  input.forEach(({ system, role }, index) => {
    const path = `${field}[${index}]`;
    if (!(SYSTEM_CODES as readonly string[]).includes(system)) {
      details.push({
        field: `${path}.system`,
        code: 'INVALID_SYSTEM',
        message: `Debe ser uno de: ${SYSTEM_CODES.join(', ')}`,
      });
      return;
    }
    const code = system as SystemCode;
    if (seen.has(code)) {
      details.push({
        field: `${path}.system`,
        code: 'DUPLICATE_SYSTEM',
        message: 'Solo se permite una asignación por sistema',
      });
      return;
    }
    seen.add(code);
    if (!(ROLES_BY_SYSTEM[code] as readonly string[]).includes(role)) {
      details.push({
        field: `${path}.role`,
        code: 'ROLE_NOT_ALLOWED_FOR_SYSTEM',
        message: `Para ${code} el rol debe ser uno de: ${ROLES_BY_SYSTEM[code].join(', ')}`,
      });
      return;
    }
    assignments.push({ system: code, role: role as Role });
  });

  return { assignments: sortAssignments(assignments), details };
}

export function sortAssignments(assignments: readonly Assignment[]) {
  return [...assignments].sort((a, b) => a.system.localeCompare(b.system));
}

export function sameAssignments(
  a: readonly Assignment[],
  b: readonly Assignment[],
): boolean {
  const left = sortAssignments(a);
  const right = sortAssignments(b);
  return (
    left.length === right.length &&
    left.every(
      (item, i) =>
        item.system === right[i].system && item.role === right[i].role,
    )
  );
}

export const hasAdminRole = (assignments: readonly Assignment[]) =>
  assignments.some((assignment) => assignment.role === 'ADMIN');

export function throwIfInvalid(details: ErrorDetail[]): void {
  if (details.length > 0)
    throw new AuthDomainError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'La solicitud contiene datos inválidos',
      details,
    );
}
