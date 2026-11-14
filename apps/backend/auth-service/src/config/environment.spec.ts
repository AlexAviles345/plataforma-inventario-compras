import { validateEnvironment } from './environment';

const PRODUCTION_DATABASE = {
  DB_HOST: 'auth-db',
  DB_NAME: 'auth',
  DB_USER: 'auth',
  DB_PASSWORD: 'secreto-externo',
};

describe('validateEnvironment', () => {
  it('applies safe development defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      DOCS_ENABLED: true,
    });
  });

  it('parses explicit values', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        PORT: '3101',
        DOCS_ENABLED: 'false',
      }),
    ).toMatchObject({ NODE_ENV: 'test', PORT: 3101, DOCS_ENABLED: false });
  });

  it.each(['0', '65536', 'invalid'])('rejects invalid port %s', (port) => {
    expect(() => validateEnvironment({ PORT: port })).toThrow(/PORT/);
  });

  it('disables documentation by default in production', () => {
    expect(
      validateEnvironment({ NODE_ENV: 'production', ...PRODUCTION_DATABASE }),
    ).toMatchObject({ DOCS_ENABLED: false, DB_HOST: 'auth-db' });
  });

  it('defaults the database to the local docker-compose instance', () => {
    expect(validateEnvironment({})).toMatchObject({
      DB_HOST: '127.0.0.1',
      DB_PORT: 5432,
      DB_NAME: 'auth_db',
      DB_USER: 'auth_user',
      DB_PASSWORD: 'auth_password',
      DB_POOL_MAX: 10,
    });
  });

  it('requires explicit database credentials in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      /DB_HOST es obligatorio en producción/,
    );
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DB_HOST: 'db',
        DB_NAME: 'auth',
        DB_USER: 'auth',
      }),
    ).toThrow(/DB_PASSWORD es obligatorio en producción/);
  });

  it('keeps the database password exactly as provided', () => {
    expect(
      validateEnvironment({ DB_PASSWORD: ' con espacios ' }),
    ).toMatchObject({ DB_PASSWORD: ' con espacios ' });
  });

  it.each([
    ['DB_HOST', '  '],
    ['DB_PORT', '70000'],
    ['DB_POOL_MAX', '0'],
    ['DB_POOL_MAX', '101'],
  ])('rejects invalid %s=%p', (key, value) => {
    expect(() => validateEnvironment({ [key]: value })).toThrow(key);
  });

  it('rejects public documentation in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DOCS_ENABLED: 'true' }),
    ).toThrow(/producción/);
  });
});
