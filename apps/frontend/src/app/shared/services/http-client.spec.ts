import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { createAccessToken } from '@/test/token-fixture';
import { mockApiServer } from '@/test/server';
import { GatewayApiError } from './gateway-api-error';
import { apiRequest } from './http-client';

describe('http-client', () => {
  it('inyecta Authorization, Idempotency-Key y X-Request-Id', async () => {
    useAuthSessionStore
      .getState()
      .setAccessToken(createAccessToken({ system: 'PURCHASES' }));

    mockApiServer.use(
      http.post(/\/api\/purchases\/orders$/, ({ request }) => {
        expect(request.headers.get('authorization')).toMatch(/^Bearer /);
        expect(request.headers.get('idempotency-key')).toBe(
          '11111111-1111-4111-8111-111111111111',
        );
        expect(request.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);

        return HttpResponse.json(
          {
            error: false,
            statusCode: 201,
            message: 'Creada',
            data: { id: 'order-1' },
          },
          { status: 201 },
        );
      }),
    );

    const result = await apiRequest<{ id: string }, { supplierName: string }>({
      method: 'POST',
      url: '/api/purchases/orders',
      requiredSystem: 'PURCHASES',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      data: { supplierName: 'Proveedor' },
    });

    expect(result.data.id).toBe('order-1');
  });

  it('normaliza un 409 y conserva Retry-After', async () => {
    useAuthSessionStore
      .getState()
      .setAccessToken(createAccessToken({ system: 'PURCHASES' }));

    mockApiServer.use(
      http.get(/\/api\/purchases\/orders$/, () =>
        HttpResponse.json(
          {
            error: true,
            statusCode: 409,
            code: 'PROJECTION_NOT_READY',
            message: 'Sincronizando catálogo',
            source: 'purchases',
          },
          { status: 409, headers: { 'Retry-After': '2' } },
        ),
      ),
    );

    await expect(
      apiRequest({
        method: 'GET',
        url: '/api/purchases/orders',
        requiredSystem: 'PURCHASES',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayApiError>>({
        code: 'PROJECTION_NOT_READY',
        retryAfterSeconds: 2,
      }),
    );
  });
});
