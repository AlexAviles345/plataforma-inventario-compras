import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { createAccessToken } from '@/test/token-fixture';
import { mockApiServer } from '@/test/server';
import { DynamicSidebar } from './DynamicSidebar';

function renderSidebar() {
  useAuthSessionStore.getState().setAccessToken(createAccessToken());
  mockApiServer.use(
    http.post(/\/api\/auth\/logout$/, () =>
      HttpResponse.json({
        error: false,
        statusCode: 200,
        message: 'Sesión cerrada exitosamente',
        data: null,
      }),
    ),
  );

  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DynamicSidebar />} />
        <Route path="/login" element={<p>Pantalla de acceso</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DynamicSidebar', () => {
  it('conserva la sesión cuando se cancela la confirmación', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: '¿Cerrar sesión?' }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useAuthSessionStore.getState().sessions.INVENTORY).toBeDefined();
  });

  it('cierra la sesión únicamente después de confirmar', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cerrar sesión',
      }),
    );

    expect(await screen.findByText('Pantalla de acceso')).toBeInTheDocument();
    expect(useAuthSessionStore.getState().sessions).toEqual({});
  });

  it('muestra todas las secciones autorizadas para ADMIN con ambos sistemas', () => {
    useAuthSessionStore
      .getState()
      .setRenewableSessionBundle(
        createAccessToken({ system: 'INVENTORY', role: 'ADMIN' }),
        [
          createAccessToken({ system: 'INVENTORY', role: 'ADMIN' }),
          createAccessToken({ system: 'PURCHASES', role: 'ADMIN' }),
        ],
      );

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DynamicSidebar />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Productos' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Órdenes de compra' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('Inventario')).toBeInTheDocument();
    expect(screen.getByText('Compras')).toBeInTheDocument();
  });

  it('muestra solo las secciones permitidas para INVENTORY_MANAGER y PURCHASES_AGENT', () => {
    useAuthSessionStore
      .getState()
      .setAccessToken(
        createAccessToken({ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }),
      );

    const { unmount } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DynamicSidebar />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Productos' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Órdenes de compra' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Usuarios' }),
    ).not.toBeInTheDocument();

    unmount();
    useAuthSessionStore.getState().clearSession();
    useAuthSessionStore
      .getState()
      .setAccessToken(
        createAccessToken({ system: 'PURCHASES', role: 'PURCHASES_AGENT' }),
      );

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DynamicSidebar />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Resumen' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Órdenes de compra' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Productos' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Usuarios' }),
    ).not.toBeInTheDocument();
  });
});
