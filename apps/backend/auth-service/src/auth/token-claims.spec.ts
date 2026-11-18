import { isAccessTokenClaims } from './token-claims';

const NOW = 1_794_182_400;

const claims = (overrides: Record<string, unknown> = {}) => ({
  sub: '767cc714-0614-4ab9-9510-c4772b403fed',
  email: 'usuario@techdistribution.com',
  role: 'INVENTORY_MANAGER',
  system: 'INVENTORY',
  iat: NOW,
  exp: NOW + 900,
  iss: 'techdistribution-auth',
  aud: 'techdistribution-api',
  ...overrides,
});

const valid = (value: unknown, maxTtl = 900) =>
  isAccessTokenClaims(value, maxTtl, NOW);

describe('isAccessTokenClaims', () => {
  it('accepts the claims from the standard', () => {
    expect(valid(claims())).toBe(true);
  });

  it.each([
    ['ADMIN', 'INVENTORY'],
    ['ADMIN', 'PURCHASES'],
    ['INVENTORY_MANAGER', 'INVENTORY'],
    ['PURCHASES_AGENT', 'PURCHASES'],
  ])('accepts %s on %s', (role, system) => {
    expect(valid(claims({ role, system }))).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    [
      'INVENTORY_MANAGER on PURCHASES',
      { role: 'INVENTORY_MANAGER', system: 'PURCHASES' },
    ],
    [
      'PURCHASES_AGENT on INVENTORY',
      { role: 'PURCHASES_AGENT', system: 'INVENTORY' },
    ],
    ['an unknown role', { role: 'SUPERUSER' }],
    ['an unknown system', { system: 'BILLING' }],
    ['a non-UUID sub', { sub: '42' }],
    ['an invalid email', { email: 'no-es-email' }],
    ['a numeric email', { email: 1 }],
    ['iat more than 30 s in the future', { iat: NOW + 31, exp: NOW + 600 }],
    ['an expired token', { iat: NOW - 1000, exp: NOW - 1 }],
    ['exp equal to iat', { exp: NOW }],
    ['a TTL above the maximum', { exp: NOW + 901 }],
    ['a fractional iat', { iat: NOW + 0.5 }],
    ['iat as a string', { iat: String(NOW) }],
    ['a missing iss', { iss: undefined }],
    ['an array aud', { aud: ['techdistribution-api'] }],
  ])('rejects %s', (_case, overrides) => {
    expect(valid(claims(overrides))).toBe(false);
  });

  it('tolerates up to 30 seconds of clock skew on iat', () => {
    expect(valid(claims({ iat: NOW + 30, exp: NOW + 900 }))).toBe(true);
  });

  it('uses the configured maximum TTL', () => {
    expect(valid(claims({ exp: NOW + 300 }), 300)).toBe(true);
    expect(valid(claims({ exp: NOW + 301 }), 300)).toBe(false);
  });

  it.each([null, 'token', 42, []])('rejects non-object payload %p', (value) => {
    expect(valid(value)).toBe(false);
  });
});
