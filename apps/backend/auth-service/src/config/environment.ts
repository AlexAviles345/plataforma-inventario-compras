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

  Object.assign(result, databaseVariables(env, nodeEnvironment));
  Object.assign(result, jwtVariables(env));
  return result;
}

/**
 * Solo las variables de PostgreSQL. La usa el CLI de migraciones, que no firma
 * tokens y por lo tanto no debe exigir JWT_SECRET.
 */
export function validateDatabaseEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  return { ...env, ...databaseVariables(env, env.NODE_ENV ?? 'development') };
}

function databaseVariables(
  env: Record<string, unknown>,
  nodeEnvironment: unknown,
): Record<string, unknown> {
  const production = nodeEnvironment === 'production';
  return {
    DB_HOST: requiredText(env, 'DB_HOST', production),
    DB_PORT: integer(env, 'DB_PORT', 5432, 65535),
    DB_NAME: requiredText(env, 'DB_NAME', production),
    DB_USER: requiredText(env, 'DB_USER', production),
    DB_PASSWORD: requiredText(env, 'DB_PASSWORD', production, false),
    DB_POOL_MAX: integer(env, 'DB_POOL_MAX', 10, 100),
  };
}

/** Mismas reglas que el Gateway: ambos deben compartir secreto, emisor y audiencia. */
function jwtVariables(env: Record<string, unknown>): Record<string, unknown> {
  const secret = env.JWT_SECRET;
  if (
    typeof secret !== 'string' ||
    Buffer.byteLength(secret) < 32 ||
    /^(tu_|change|replace|generate)/i.test(secret)
  ) {
    throw new Error(
      'JWT_SECRET debe ser un secreto aleatorio de al menos 32 bytes, igual al del Gateway',
    );
  }
  const text = (key: string, fallback: string) => {
    const value = env[key] ?? fallback;
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`${key} no puede estar vacío`);
    return value;
  };
  return {
    JWT_SECRET: secret,
    JWT_ISSUER: text('JWT_ISSUER', 'techdistribution-auth'),
    JWT_AUDIENCE: text('JWT_AUDIENCE', 'techdistribution-api'),
    JWT_MAX_TTL_SECONDS: integer(env, 'JWT_MAX_TTL_SECONDS', 900, 3600),
  };
}
