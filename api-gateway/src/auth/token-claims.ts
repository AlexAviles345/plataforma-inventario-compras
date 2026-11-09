export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: 'ADMIN' | 'INVENTORY_MANAGER' | 'PURCHASES_AGENT';
  system: 'INVENTORY' | 'PURCHASES';
  iat: number;
  exp: number;
}

export function isAccessTokenClaims(
  value: unknown,
  maxTtl: number,
): value is AccessTokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const claims = value as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  return (
    typeof claims.sub === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      claims.sub,
    ) &&
    typeof claims.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) &&
    typeof claims.role === 'string' &&
    ['ADMIN', 'INVENTORY_MANAGER', 'PURCHASES_AGENT'].includes(claims.role) &&
    typeof claims.system === 'string' &&
    ['INVENTORY', 'PURCHASES'].includes(claims.system) &&
    (claims.role === 'ADMIN' ||
      (claims.role === 'INVENTORY_MANAGER' && claims.system === 'INVENTORY') ||
      (claims.role === 'PURCHASES_AGENT' && claims.system === 'PURCHASES')) &&
    typeof claims.iat === 'number' &&
    Number.isSafeInteger(claims.iat) &&
    claims.iat > 0 &&
    claims.iat <= now + 30 &&
    typeof claims.exp === 'number' &&
    Number.isSafeInteger(claims.exp) &&
    claims.exp > now &&
    claims.exp > claims.iat &&
    claims.exp - claims.iat <= maxTtl
  );
}
