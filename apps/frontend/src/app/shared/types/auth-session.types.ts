export const SYSTEM_CODES = ['INVENTORY', 'PURCHASES'] as const;
export const USER_ROLES = [
  'ADMIN',
  'INVENTORY_MANAGER',
  'PURCHASES_AGENT',
] as const;

export type SystemCode = (typeof SYSTEM_CODES)[number];
export type UserRole = (typeof USER_ROLES)[number];

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
  system: SystemCode;
  iat: number;
  exp: number;
  iss: 'techdistribution-auth';
  aud: 'techdistribution-api';
}

export interface SystemSession {
  accessToken: string;
  claims: AccessTokenClaims;
}

export interface IssuedTokenEntry {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export type SystemSessions = Partial<Record<SystemCode, SystemSession>>;

export function isSystemCode(value: unknown): value is SystemCode {
  return (
    typeof value === 'string' &&
    (SYSTEM_CODES as readonly string[]).includes(value)
  );
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}
