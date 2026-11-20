import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { createAccessToken } from '@/test/token-fixture';
import { mockApiServer } from '@/test/server';
import {
  hasRenewableSession,
  logoutSession,
  readCsrfToken,
  refreshSession,
} from './auth-session.service';

function setCsrfCookie(value: string) {
  document.cookie = `td_csrf=${encodeURIComponent(value)}; Path=/`;
}

describe('auth-session service', () => {
  it('copies the readable CSRF cookie and shares concurrent refreshes', async () => {
    setCsrfCookie('csrf-proof');
    let requests = 0;

    mockApiServer.use(
      http.post(/\/api\/auth\/refresh$/, async ({ request }) => {
        requests += 1;
        expect(request.headers.get('x-csrf-token')).toBe('csrf-proof');
        await delay(10);
        return HttpResponse.json({
          error: false,
          statusCode: 200,
          message: 'Sesión renovada exitosamente',
          data: {
            accessToken: createAccessToken(),
            tokenType: 'Bearer',
            expiresIn: 900,
          },
        });
      }),
    );

    const [first, second] = await Promise.all([
      refreshSession(),
      refreshSession(),
    ]);

    expect(first.accessToken).toBe(second.accessToken);
    expect(requests).toBe(1);
    expect(readCsrfToken()).toBe('csrf-proof');
    expect(hasRenewableSession()).toBe(true);
  });

  it('sends CSRF when closing the renewable session', async () => {
    setCsrfCookie('logout-proof');
    mockApiServer.use(
      http.post(/\/api\/auth\/logout$/, ({ request }) => {
        expect(request.headers.get('x-csrf-token')).toBe('logout-proof');
        return HttpResponse.json({
          error: false,
          statusCode: 200,
          message: 'Sesión cerrada exitosamente',
          data: null,
        });
      }),
    );

    await expect(logoutSession()).resolves.toBeUndefined();
  });
});
