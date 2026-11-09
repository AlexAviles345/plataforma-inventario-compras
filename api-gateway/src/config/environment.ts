function integer(
  env: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number {
  const raw = env[key] ?? fallback;
  if (typeof raw !== 'string' && typeof raw !== 'number')
    throw new Error(`${key} debe ser numérico`);
  const value = Number(raw);
  if (
    !/^\d+$/.test(String(raw)) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new Error(`${key} debe ser un entero entre 1 y ${max}`);
  return value;
}

export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...env };
  const secret = env.JWT_SECRET;
  if (
    typeof secret !== 'string' ||
    Buffer.byteLength(secret) < 32 ||
    /^(tu_|change|replace|generate)/i.test(secret)
  )
    throw new Error(
      'JWT_SECRET debe ser un secreto aleatorio de al menos 32 bytes',
    );
  for (const key of [
    'AUTH_SERVICE_URL',
    'INVENTORY_SERVICE_URL',
    'PURCHASES_SERVICE_URL',
  ]) {
    const value = env[key];
    if (typeof value !== 'string') throw new Error(`${key} es obligatorio`);
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        `${key} debe ser un origen HTTP(S) sin credenciales, path, query ni fragmento`,
      );
    result[key] = url.origin;
  }
  result.PORT = integer(env, 'PORT', 3000, 65535);
  result.PROXY_TIMEOUT_MS = integer(env, 'PROXY_TIMEOUT_MS', 10000, 120000);
  result.MAX_BODY_BYTES = integer(env, 'MAX_BODY_BYTES', 1048576, 104857600);
  result.JWT_MAX_TTL_SECONDS = integer(env, 'JWT_MAX_TTL_SECONDS', 900, 3600);
  for (const key of ['JWT_ISSUER', 'JWT_AUDIENCE']) {
    const value =
      env[key] ??
      (key === 'JWT_ISSUER' ? 'techdistribution-auth' : 'techdistribution-api');
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`${key} no puede estar vacío`);
    result[key] = value;
  }
  const docs =
    env.DOCS_ENABLED ?? (env.NODE_ENV !== 'production' ? 'true' : 'false');
  if (docs !== 'true' && docs !== 'false')
    throw new Error('DOCS_ENABLED debe ser true o false');
  if (env.NODE_ENV === 'production' && docs === 'true')
    throw new Error('DOCS_ENABLED debe ser false en producción');
  result.DOCS_ENABLED = docs === 'true';
  const configuredOrigins = env.CORS_ORIGINS ?? 'http://localhost:5173';
  if (typeof configuredOrigins !== 'string')
    throw new Error('CORS_ORIGINS debe ser texto');
  const origins = configuredOrigins.split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    if (new URL(origin).origin !== origin || !/^https?:\/\//.test(origin))
      throw new Error(
        'CORS_ORIGINS debe contener orígenes HTTP(S) separados por comas',
      );
  }
  result.CORS_ORIGINS = origins;
  return result;
}
