export const BASE_RETRY_DELAY_MS = 1_000;
export const MAX_RETRY_DELAY_MS = 5 * 60_000;

/**
 * Backoff exponencial con jitter para el intento `attempt` (1, 2, 3...):
 * 1 s, 2 s, 4 s... hasta 5 min. El jitter toma un valor en [50 %, 100 %] del
 * retraso para que varias réplicas no reintenten a la vez. Los reintentos no
 * tienen límite: el outbox nunca descarta ni salta un evento.
 */
export function retryDelayMs(attempt: number, random = Math.random): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 30));
  const delay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** exponent,
    MAX_RETRY_DELAY_MS,
  );
  return Math.round(delay / 2 + random() * (delay / 2));
}

/** Mensaje de error de una sola línea, sin payload, apto para `last_error`. */
export function sanitizeError(error: unknown, maxLength = 1000): string {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `Error: ${String(error)}`;
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return singleLine.length > maxLength
    ? `${singleLine.slice(0, maxLength - 1)}…`
    : singleLine;
}
