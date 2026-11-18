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
});
