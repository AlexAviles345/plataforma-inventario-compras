import { apiRequest } from '@shared/services/http-client';

import type {
  AdminUser,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from '../types/users-admin.types';

const USERS_PATH = '/api/auth/users';

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
