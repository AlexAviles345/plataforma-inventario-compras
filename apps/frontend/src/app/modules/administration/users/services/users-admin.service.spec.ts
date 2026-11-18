import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { createAccessToken } from '@/test/token-fixture';
import { mockApiServer } from '@/test/server';
import type { AdminUser } from '../types/users-admin.types';
import { listAdminUsers } from './users-admin.service';

const user: AdminUser = {
  id: '4ab2d52e-4028-40ec-9a49-e756b585d8af',
  email: 'gestor@techdistribution.com',
  displayName: 'Gestor',
  active: true,
  assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
  version: 1,
  createdAt: '2026-11-18T16:10:00.000Z',
  updatedAt: '2026-11-18T16:10:00.000Z',
};

describe('users-admin.service', () => {
  it('consulta usuarios paginados mediante el Gateway', async () => {
    useAuthSessionStore
      .getState()
      .setAccessToken(createAccessToken({ role: 'ADMIN' }));

    mockApiServer.use(
      http.get(/\/api\/auth\/users$/, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page')).toBe('2');
        expect(url.searchParams.get('limit')).toBe('10');
        expect(request.headers.get('authorization')).toMatch(/^Bearer /);

        return HttpResponse.json({
          error: false,
          statusCode: 200,
          message: 'Usuarios obtenidos exitosamente',
          data: [user],
          meta: { page: 2, limit: 10, total: 11, totalPages: 2 },
        });
      }),
    );

    await expect(listAdminUsers({ page: 2, limit: 10 })).resolves.toEqual({
      users: [user],
      meta: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
  });
});
