import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function stripUntrustedHeaders(request: Request): void {
  for (const header of Object.keys(request.headers)) {
    if (
      header.startsWith('x-user-') ||
      header.startsWith('x-forwarded-') ||
      header === 'forwarded'
    )
      delete request.headers[header];
  }
}

export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  stripUntrustedHeaders(request);
  const requestId = randomUUID();
  const path = request.path;
  request.headers['x-request-id'] = requestId;
  response.setHeader('X-Request-Id', requestId);
  const start = performance.now();
  let logged = false;
  const log = () => {
    if (logged) return;
    logged = true;
    console.info(
      JSON.stringify({
        service: 'api-gateway',
        type: 'http',
        requestId,
        method: request.method,
        path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - start),
        completed: response.writableFinished,
      }),
    );
  };
  response.once('finish', log);
  response.once('close', log);
  next();
}
