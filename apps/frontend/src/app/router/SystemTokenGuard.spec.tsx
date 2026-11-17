import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { createAccessToken } from '@/test/token-fixture';
import { SystemTokenGuard } from './SystemTokenGuard';

function renderGuard(roles: ('ADMIN' | 'INVENTORY_MANAGER')[] = ['ADMIN']) {
  return render(
    <MemoryRouter initialEntries={['/administration/users']}>
      <Routes>
        <Route
          path="/administration/users"
          element={
            <SystemTokenGuard roles={roles}>
              <p>Contenido administrativo</p>
            </SystemTokenGuard>
          }
        />
        <Route path="/login" element={<p>Acceso</p>} />
        <Route path="/forbidden" element={<p>Sin permisos</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SystemTokenGuard', () => {
  it('permite la ruta a un administrador', () => {
    useAuthSessionStore
      .getState()
      .setAccessToken(createAccessToken({ role: 'ADMIN' }));

    renderGuard();

    expect(screen.getByText('Contenido administrativo')).toBeInTheDocument();
  });

  it('redirige un rol sin permisos', () => {
    useAuthSessionStore.getState().setAccessToken(
      createAccessToken({
        role: 'INVENTORY_MANAGER',
        system: 'INVENTORY',
      }),
    );

    renderGuard();

    expect(screen.getByText('Sin permisos')).toBeInTheDocument();
  });

  it('redirige al login cuando no existe sesión', () => {
    renderGuard();

    expect(screen.getByText('Acceso')).toBeInTheDocument();
  });
});
