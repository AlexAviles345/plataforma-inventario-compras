import type { AdminUsersListFilters } from '../types/users-admin.types';

export const userQueryKeys = {
  all: ['auth-admin-users'] as const,
  lists: () => [...userQueryKeys.all, 'list'] as const,
  list: (filters: AdminUsersListFilters) =>
    [...userQueryKeys.lists(), filters] as const,
};
