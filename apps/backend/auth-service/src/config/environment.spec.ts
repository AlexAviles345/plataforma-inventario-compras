import { validateEnvironment } from './environment';

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
    expect(validateEnvironment({ NODE_ENV: 'production' })).toMatchObject({
      DOCS_ENABLED: false,
    });
  });

  it('rejects public documentation in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', DOCS_ENABLED: 'true' }),
    ).toThrow(/producción/);
  });
});
