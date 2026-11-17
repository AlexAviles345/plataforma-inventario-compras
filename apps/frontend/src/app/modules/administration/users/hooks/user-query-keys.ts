export const userQueryKeys = {
  all: ['auth-admin-users'] as const,
  known: () => [...userQueryKeys.all, 'known-in-session'] as const,
};
