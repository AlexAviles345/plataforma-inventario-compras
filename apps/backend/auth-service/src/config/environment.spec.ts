import {
  validateDatabaseEnvironment,
  validateEnvironment,
} from './environment';

const JWT = { JWT_SECRET: 'unit-test-secret-with-more-than-32-bytes!!' };

const PRODUCTION_DATABASE = {
  DB_HOST: 'auth-db',
  DB_NAME: 'auth',
  DB_USER: 'auth',
  DB_PASSWORD: 'secreto-externo',
};

const validate = (env: Record<string, unknown> = {}) =>
  validateEnvironment({ ...JWT, ...env });

describe('validateEnvironment', () => {
  it('applies safe development defaults', () => {
    expect(validate()).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      DOCS_ENABLED: true,
    });
  });

  it('parses explicit values', () => {
    expect(
      validate({ NODE_ENV: 'test', PORT: '3101', DOCS_ENABLED: 'false' }),
    ).toMatchObject({ NODE_ENV: 'test', PORT: 3101, DOCS_ENABLED: false });
  });

  it.each(['0', '65536', 'invalid'])('rejects invalid port %s', (port) => {
    expect(() => validate({ PORT: port })).toThrow(/PORT/);
  });

  it('disables documentation by default in production', () => {
    expect(
      validate({ NODE_ENV: 'production', ...PRODUCTION_DATABASE }),
    ).toMatchObject({ DOCS_ENABLED: false, DB_HOST: 'auth-db' });
  });

  it('rejects public documentation in production', () => {
    expect(() =>
      validate({
        NODE_ENV: 'production',
        DOCS_ENABLED: 'true',
        ...PRODUCTION_DATABASE,
      }),
    ).toThrow(/producción/);
  });

  describe('database', () => {
    it('defaults to the local docker-compose instance', () => {
      expect(validate()).toMatchObject({
        DB_HOST: '127.0.0.1',
        DB_PORT: 5432,
        DB_NAME: 'auth_db',
        DB_USER: 'auth_user',
        DB_PASSWORD: 'auth_password',
        DB_POOL_MAX: 10,
      });
    });

    it('requires explicit credentials in production', () => {
      expect(() => validate({ NODE_ENV: 'production' })).toThrow(
        /DB_HOST es obligatorio en producción/,
      );
      expect(() =>
        validate({
          NODE_ENV: 'production',
          DB_HOST: 'db',
          DB_NAME: 'auth',
          DB_USER: 'auth',
        }),
      ).toThrow(/DB_PASSWORD es obligatorio en producción/);
    });

    it('keeps the password exactly as provided', () => {
      expect(validate({ DB_PASSWORD: ' con espacios ' })).toMatchObject({
        DB_PASSWORD: ' con espacios ',
      });
    });

    it.each([
      ['DB_HOST', '  '],
      ['DB_PORT', '70000'],
      ['DB_POOL_MAX', '0'],
      ['DB_POOL_MAX', '101'],
    ])('rejects invalid %s=%p', (key, value) => {
      expect(() => validate({ [key]: value })).toThrow(key);
    });

    it('validates only the database for the migration CLI', () => {
      expect(validateDatabaseEnvironment({})).toMatchObject({
        DB_HOST: '127.0.0.1',
        DB_NAME: 'auth_db',
      });
      expect(() =>
        validateDatabaseEnvironment({ NODE_ENV: 'production' }),
      ).toThrow(/DB_HOST/);
    });
  });

  describe('JWT', () => {
    it('defaults issuer, audience and max TTL to the shared contract', () => {
      expect(validate()).toMatchObject({
        JWT_ISSUER: 'techdistribution-auth',
        JWT_AUDIENCE: 'techdistribution-api',
        JWT_MAX_TTL_SECONDS: 900,
      });
    });

    it.each([
      ['missing', undefined],
      ['shorter than 32 bytes', 'demasiado-corto'],
      [
        'the example placeholder',
        'replace_with_a_random_secret_of_at_least_32_bytes',
      ],
      ['a change-me value', 'change-me-change-me-change-me-change-me'],
    ])('rejects a secret that is %s', (_case, secret) => {
      expect(() => validateEnvironment({ JWT_SECRET: secret })).toThrow(
        /JWT_SECRET/,
      );
    });

    it.each(['0', '3601', 'x'])('rejects JWT_MAX_TTL_SECONDS=%p', (value) => {
      expect(() => validate({ JWT_MAX_TTL_SECONDS: value })).toThrow(
        /JWT_MAX_TTL_SECONDS/,
      );
    });

    it('rejects an empty issuer or audience', () => {
      expect(() => validate({ JWT_ISSUER: ' ' })).toThrow(/JWT_ISSUER/);
      expect(() => validate({ JWT_AUDIENCE: '' })).toThrow(/JWT_AUDIENCE/);
    });
  });
});
