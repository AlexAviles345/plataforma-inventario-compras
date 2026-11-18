import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { createAccessToken } from '@/test/token-fixture';
import { DynamicSidebar } from './DynamicSidebar';

function renderSidebar() {
  useAuthSessionStore.getState().setAccessToken(createAccessToken());

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

    expect(screen.getByText('Pantalla de acceso')).toBeInTheDocument();
    expect(useAuthSessionStore.getState().sessions).toEqual({});
  });
});
