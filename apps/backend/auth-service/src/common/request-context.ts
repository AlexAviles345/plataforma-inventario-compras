import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Conserva el X-Request-Id recibido (normalmente generado por el Gateway) si es
 * un UUID canónico; en cualquier otro caso genera uno nuevo para no propagar
 * valores arbitrarios a logs, auditoría u outbox.
 */
export function resolveRequestId(raw: unknown): string {
  if (typeof raw === 'string') {
    const candidate = raw.trim();
    if (UUID_PATTERN.test(candidate)) return candidate.toLowerCase();
  }
  return randomUUID();
}

/** Request id de la petición en curso; undefined fuera de una petición HTTP. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Ejecuta `fn` con un request id fijo. Lo usan los comandos CLI (bootstrap) y
 * las pruebas para correlacionar auditoría y outbox fuera de HTTP.
 */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

export function createRequestContextMiddleware(options: { log: boolean }) {
  return function requestContext(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    if (options.log) {
      const start = performance.now();
      const method = request.method;
      // Solo el path: la query string nunca se registra.
      const path = request.path;
      let logged = false;
      const log = () => {
        if (logged) return;
        logged = true;
        console.info(
          JSON.stringify({
            service: 'auth-service',
            type: 'http',
            requestId,
            method,
            path,
            status: response.statusCode,
            durationMs: Math.round(performance.now() - start),
            completed: response.writableFinished,
          }),
        );
      };
      response.once('finish', log);
      response.once('close', log);
    }

    storage.run({ requestId }, next);
  };
}
