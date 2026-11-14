const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

function integer(
  env: Record<string, unknown>,
  key: string,
  fallback: number,
  maximum: number,
): number {
  const raw = env[key] ?? fallback;
  const value = Number(raw);
  if (
    (typeof raw !== 'string' && typeof raw !== 'number') ||
    !/^\d+$/.test(String(raw)) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`${key} debe ser un entero entre 1 y ${maximum}`);
  }
  return value;
}

/** Valores del docker-compose.example.yml; nunca se aplican en producción. */
const LOCAL_DATABASE: Record<string, string> = {
  DB_HOST: '127.0.0.1',
  DB_NAME: 'auth_db',
  DB_USER: 'auth_user',
  DB_PASSWORD: 'auth_password',
};

function requiredText(
  env: Record<string, unknown>,
  key: string,
  production: boolean,
  trim = true,
): string {
  const raw = env[key] ?? (production ? undefined : LOCAL_DATABASE[key]);
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      production
        ? `${key} es obligatorio en producción`
        : `${key} no puede estar vacío`,
    );
  }
  return trim ? raw.trim() : raw;
}

export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...env };
  const nodeEnvironment = env.NODE_ENV ?? 'development';
  if (
    typeof nodeEnvironment !== 'string' ||
    !NODE_ENVIRONMENTS.includes(
      nodeEnvironment as (typeof NODE_ENVIRONMENTS)[number],
    )
  ) {
    throw new Error(
      `NODE_ENV debe ser uno de: ${NODE_ENVIRONMENTS.join(', ')}`,
    );
  }
  result.NODE_ENV = nodeEnvironment;
  result.PORT = integer(env, 'PORT', 3001, 65535);

  const docs =
    env.DOCS_ENABLED ?? (nodeEnvironment === 'production' ? 'false' : 'true');
  if (docs !== 'true' && docs !== 'false') {
    throw new Error('DOCS_ENABLED debe ser true o false');
  }
  if (nodeEnvironment === 'production' && docs === 'true') {
    throw new Error('DOCS_ENABLED debe ser false en producción');
  }
  result.DOCS_ENABLED = docs === 'true';

  const production = nodeEnvironment === 'production';
  result.DB_HOST = requiredText(env, 'DB_HOST', production);
  result.DB_PORT = integer(env, 'DB_PORT', 5432, 65535);
  result.DB_NAME = requiredText(env, 'DB_NAME', production);
  result.DB_USER = requiredText(env, 'DB_USER', production);
  result.DB_PASSWORD = requiredText(env, 'DB_PASSWORD', production, false);
  result.DB_POOL_MAX = integer(env, 'DB_POOL_MAX', 10, 100);
  return result;
}
