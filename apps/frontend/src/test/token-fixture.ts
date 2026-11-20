import type {
  AccessTokenClaims,
  SystemCode,
  UserRole,
} from '@shared/types/auth-session.types';

function encode(value: object): string {
  return btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function createAccessToken({
  system = 'INVENTORY',
  role = 'ADMIN',
  subject = '00000000-0000-4000-8000-000000000001',
  expiresIn = 300,
}: {
  system?: SystemCode;
  role?: UserRole;
  subject?: string;
  expiresIn?: number;
} = {}): string {
  const now = Math.floor(Date.now() / 1_000);
  const claims: AccessTokenClaims = {
    sub: subject,
    email: 'admin@techdistribution.test',
    role,
    system,
    iat: now,
    exp: now + expiresIn,
    iss: 'techdistribution-auth',
    aud: 'techdistribution-api',
  };

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.test-signature`;
}
