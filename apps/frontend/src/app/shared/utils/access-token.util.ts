import { jwtDecode } from 'jwt-decode';

import {
  isSystemCode,
  isUserRole,
  type AccessTokenClaims,
} from '@shared/types/auth-session.types';

const ACCESS_TOKEN_ISSUER = 'techdistribution-auth';
const ACCESS_TOKEN_AUDIENCE = 'techdistribution-api';
const MAX_ACCESS_TOKEN_TTL_SECONDS = 3600;
const MAX_CLOCK_SKEW_SECONDS = 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidAccessTokenError extends Error {
  constructor(message = 'El access token no cumple el contrato de seguridad') {
    super(message);
    this.name = 'InvalidAccessTokenError';
  }
}

function hasValidRoleSystemPair(claims: AccessTokenClaims): boolean {
  return (
    claims.role === 'ADMIN' ||
    (claims.role === 'INVENTORY_MANAGER' && claims.system === 'INVENTORY') ||
    (claims.role === 'PURCHASES_AGENT' && claims.system === 'PURCHASES')
  );
}

export function decodeAndValidateAccessToken(
  accessToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AccessTokenClaims {
  let decoded: Partial<AccessTokenClaims>;

  try {
    decoded = jwtDecode<Partial<AccessTokenClaims>>(accessToken);
  } catch {
    throw new InvalidAccessTokenError('El access token no es un JWT válido');
  }

  if (
    typeof decoded.sub !== 'string' ||
    !UUID_PATTERN.test(decoded.sub) ||
    typeof decoded.email !== 'string' ||
    !EMAIL_PATTERN.test(decoded.email) ||
    !isUserRole(decoded.role) ||
    !isSystemCode(decoded.system) ||
    !Number.isInteger(decoded.iat) ||
    !Number.isInteger(decoded.exp) ||
    decoded.iss !== ACCESS_TOKEN_ISSUER ||
    decoded.aud !== ACCESS_TOKEN_AUDIENCE
  ) {
    throw new InvalidAccessTokenError();
  }

  const claims = decoded as AccessTokenClaims;

  if (
    claims.iat > nowSeconds + MAX_CLOCK_SKEW_SECONDS ||
    claims.exp <= claims.iat ||
    claims.exp <= nowSeconds ||
    claims.exp - claims.iat > MAX_ACCESS_TOKEN_TTL_SECONDS ||
    !hasValidRoleSystemPair(claims)
  ) {
    throw new InvalidAccessTokenError(
      'El access token está vencido o contiene claims incompatibles',
    );
  }

  return claims;
}

export function isAccessTokenExpired(
  claims: Pick<AccessTokenClaims, 'exp'>,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return claims.exp <= nowSeconds;
}
