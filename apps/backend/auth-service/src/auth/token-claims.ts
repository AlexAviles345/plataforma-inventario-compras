import { fullFormats } from 'ajv-formats/dist/formats';
import {
  ROLES,
  ROLES_BY_SYSTEM,
  SYSTEM_CODES,
  type Role,
  type SystemCode,
} from '../access/access-matrix';

/** Claims del access token (docs/standards/jwt-and-sessions.md). */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
  system: SystemCode;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/** Tolerancia de reloj para `iat`, la misma que aplica el Gateway. */
export const IAT_CLOCK_SKEW_SECONDS = 30;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_FORMAT = fullFormats.email as RegExp;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * Validación de claims posterior a la verificación de firma, emisor y
 * audiencia: tipos, UUID, email, matriz rol/sistema, `iat`, `exp` y TTL máximo.
 */
export function isAccessTokenClaims(
  value: unknown,
  maxTtlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): value is AccessTokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const claims = value as Record<string, unknown>;
  if (typeof claims.sub !== 'string' || !UUID_PATTERN.test(claims.sub))
    return false;
  if (typeof claims.email !== 'string' || !EMAIL_FORMAT.test(claims.email))
    return false;
  if (
    typeof claims.role !== 'string' ||
    !(ROLES as readonly string[]).includes(claims.role) ||
    typeof claims.system !== 'string' ||
    !(SYSTEM_CODES as readonly string[]).includes(claims.system) ||
    !(
      ROLES_BY_SYSTEM[claims.system as SystemCode] as readonly string[]
    ).includes(claims.role)
  )
    return false;
  if (typeof claims.iss !== 'string' || typeof claims.aud !== 'string')
    return false;
  const { iat, exp } = claims;
  return (
    isPositiveInteger(iat) &&
    isPositiveInteger(exp) &&
    iat <= nowSeconds + IAT_CLOCK_SKEW_SECONDS &&
    exp > nowSeconds &&
    exp > iat &&
    exp - iat <= maxTtlSeconds
  );
}
