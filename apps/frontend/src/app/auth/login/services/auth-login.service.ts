import { apiRequest } from '@shared/services/http-client';

import type { LoginRequest, LoginResponse } from '../types/auth-login.types';

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const result = await apiRequest<LoginResponse, LoginRequest>({
    method: 'POST',
    url: '/api/auth/login',
    data: credentials,
    anonymous: true,
  });

  return result.data;
}
