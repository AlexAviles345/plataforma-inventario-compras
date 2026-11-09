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
  return result;
}
