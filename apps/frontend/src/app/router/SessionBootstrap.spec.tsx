import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { mockApiServer } from '@/test/server';
import { createAccessToken } from '@/test/token-fixture';
import { SessionBootstrap } from './SessionBootstrap';

describe('SessionBootstrap', () => {
  it('restores the in-memory access token before rendering a protected route', async () => {
    document.cookie = 'td_csrf=restore-proof; Path=/';
    mockApiServer.use(
      http.post(/\/api\/auth\/refresh$/, ({ request }) => {
        expect(request.headers.get('x-csrf-token')).toBe('restore-proof');
        return HttpResponse.json({
          error: false,
          statusCode: 200,
          message: 'Sesión renovada exitosamente',
          data: {
            accessToken: createAccessToken({ system: 'INVENTORY' }),
            tokenType: 'Bearer',
            expiresIn: 900,
          },
        });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SessionBootstrap>
          <Routes>
            <Route path="/dashboard" element={<p>Panel restaurado</p>} />
          </Routes>
        </SessionBootstrap>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Panel restaurado')).toBeInTheDocument();
    expect(useAuthSessionStore.getState().renewableSystem).toBe('INVENTORY');
    expect(useAuthSessionStore.getState().sessions.INVENTORY).toBeDefined();
  });

  it('restores all assigned system tokens returned during refresh', async () => {
    document.cookie = 'td_csrf=restore-bundle; Path=/';
    mockApiServer.use(
      http.post(/\/api\/auth\/refresh$/, ({ request }) => {
        expect(request.headers.get('x-csrf-token')).toBe('restore-bundle');
        const invToken = createAccessToken({
          system: 'INVENTORY',
          role: 'ADMIN',
        });
        const purToken = createAccessToken({
          system: 'PURCHASES',
          role: 'ADMIN',
        });
        return HttpResponse.json({
          error: false,
          statusCode: 200,
          message: 'Sesión renovada exitosamente',
          data: {
            accessToken: invToken,
            tokenType: 'Bearer',
            expiresIn: 900,
            tokens: [
              { accessToken: invToken, tokenType: 'Bearer', expiresIn: 900 },
              { accessToken: purToken, tokenType: 'Bearer', expiresIn: 900 },
            ],
          },
        });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SessionBootstrap>
          <Routes>
            <Route path="/dashboard" element={<p>Panel múltiple</p>} />
          </Routes>
        </SessionBootstrap>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Panel múltiple')).toBeInTheDocument();
    expect(useAuthSessionStore.getState().sessions.INVENTORY).toBeDefined();
    expect(useAuthSessionStore.getState().sessions.PURCHASES).toBeDefined();
  });
});
