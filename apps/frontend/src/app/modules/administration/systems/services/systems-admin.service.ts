import { apiRequest } from '@shared/services/http-client';
import type { SystemCode } from '@shared/types/auth-session.types';

import type {
  AuthSystemConfiguration,
  UpdateSystemTtlInput,
} from '../types/systems-admin.types';

const SYSTEMS_PATH = '/api/auth/systems';

export async function listSystems(): Promise<AuthSystemConfiguration[]> {
  const result = await apiRequest<AuthSystemConfiguration[]>({
    method: 'GET',
    url: SYSTEMS_PATH,
  });
  return result.data;
}

export async function updateSystemTtl(
  code: SystemCode,
  input: UpdateSystemTtlInput,
): Promise<AuthSystemConfiguration> {
  const result = await apiRequest<
    AuthSystemConfiguration,
    UpdateSystemTtlInput
  >({
    method: 'PUT',
    url: `${SYSTEMS_PATH}/${code}`,
    data: input,
  });
  return result.data;
}
