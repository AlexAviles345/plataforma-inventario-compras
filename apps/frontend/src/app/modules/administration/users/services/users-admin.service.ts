import { apiRequest } from '@shared/services/http-client';

import type {
  AdminUser,
  AdminUsersListFilters,
  CreateAdminUserInput,
  PaginatedAdminUsers,
  UpdateAdminUserInput,
} from '../types/users-admin.types';

const USERS_PATH = '/api/auth/users';

export async function listAdminUsers(
  filters: AdminUsersListFilters,
): Promise<PaginatedAdminUsers> {
  const result = await apiRequest<AdminUser[]>({
    method: 'GET',
    url: USERS_PATH,
    params: filters,
  });

  if (!result.meta) {
    throw new Error(
      'El listado de usuarios no incluyó metadatos de paginación',
    );
  }

  return { users: result.data, meta: result.meta };
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<AdminUser> {
  const result = await apiRequest<AdminUser, CreateAdminUserInput>({
    method: 'POST',
    url: USERS_PATH,
    data: input,
  });
  return result.data;
}

export async function updateAdminUser(
  userId: string,
  input: UpdateAdminUserInput,
): Promise<AdminUser> {
  const result = await apiRequest<AdminUser, UpdateAdminUserInput>({
    method: 'PUT',
    url: `${USERS_PATH}/${userId}`,
    data: input,
  });
  return result.data;
}
