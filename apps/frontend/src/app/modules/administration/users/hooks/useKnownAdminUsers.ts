import { useQuery } from '@tanstack/react-query';

import type { AdminUser } from '../types/users-admin.types';
import { userQueryKeys } from './user-query-keys';

export function useKnownAdminUsers() {
  return useQuery({
    queryKey: userQueryKeys.known(),
    queryFn: async (): Promise<AdminUser[]> => [],
    initialData: [],
    staleTime: Infinity,
  });
}
