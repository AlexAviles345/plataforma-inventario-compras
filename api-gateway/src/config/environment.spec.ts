import { validateEnvironment } from './environment';

const valid = {
  JWT_SECRET: 'a-local-test-secret-with-at-least-32-bytes',
  AUTH_SERVICE_URL: 'http://localhost:3001',
  INVENTORY_SERVICE_URL: 'http://localhost:8081',
  PURCHASES_SERVICE_URL: 'http://localhost:8000',
};

describe('environment validation', () => {
  it('normalizes configuration and disables documentation in production', () => {
    expect(
      validateEnvironment({ ...valid, NODE_ENV: 'production' }),
    ).toMatchObject({
      DOCS_ENABLED: false,
      PORT: 3000,
      CORS_ORIGINS: ['http://localhost:5173'],
    });
  });

  it.each([
    { JWT_SECRET: '' },
    { JWT_SECRET: 'short' },
    { AUTH_SERVICE_URL: undefined },
    { AUTH_SERVICE_URL: 'file:///tmp' },
    { AUTH_SERVICE_URL: 'http://user:pass@localhost' },
    { AUTH_SERVICE_URL: 'http://localhost/api' },
    { PORT: 'abc' },
    { PORT: '0' },
    { MAX_BODY_BYTES: '-1' },
    { PROXY_TIMEOUT_MS: '1.5' },
    { JWT_ISSUER: '' },
    { JWT_AUDIENCE: '' },
    { JWT_MAX_TTL_SECONDS: '3601' },
    { DOCS_ENABLED: 'yes' },
    { NODE_ENV: 'production', DOCS_ENABLED: 'true' },
    { CORS_ORIGINS: '*' },
  ])('rejects invalid configuration: %j', (override) => {
    expect(() => validateEnvironment({ ...valid, ...override })).toThrow();
  });
});
