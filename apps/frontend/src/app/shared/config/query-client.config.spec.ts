import { describe, expect, it } from 'vitest';

import { GatewayApiError } from '@shared/services/gateway-api-error';
import { projectionRetry, projectionRetryDelay } from './query-client.config';

function projectionError(retryAfterSeconds?: number) {
  return new GatewayApiError('Proyección pendiente', {
    statusCode: 409,
    code: 'PROJECTION_NOT_READY',
    source: 'purchases',
    retryAfterSeconds,
  });
}

describe('query-client.config', () => {
  it('reintenta únicamente PROJECTION_NOT_READY hasta cuatro intentos', () => {
    const error = projectionError();

    expect(projectionRetry(0, error)).toBe(true);
    expect(projectionRetry(3, error)).toBe(true);
    expect(projectionRetry(4, error)).toBe(false);
    expect(projectionRetry(0, new Error('network'))).toBe(false);
  });

  it('respeta Retry-After y usa dos segundos como respaldo', () => {
    expect(projectionRetryDelay(0, projectionError(3))).toBe(3_000);
    expect(projectionRetryDelay(0, projectionError())).toBe(2_000);
  });
});
