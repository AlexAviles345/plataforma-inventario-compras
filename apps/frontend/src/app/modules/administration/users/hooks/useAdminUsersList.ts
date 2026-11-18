import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listAdminUsers } from '../services/users-admin.service';
import type { AdminUsersListFilters } from '../types/users-admin.types';
import { userQueryKeys } from './user-query-keys';

export function useAdminUsersList(filters: AdminUsersListFilters) {
  return useQuery({
    queryKey: userQueryKeys.list(filters),
    queryFn: () => listAdminUsers(filters),
    placeholderData: keepPreviousData,
  });
}
