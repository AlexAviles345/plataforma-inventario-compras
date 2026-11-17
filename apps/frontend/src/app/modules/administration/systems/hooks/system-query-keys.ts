export const systemQueryKeys = {
  all: ['auth-systems'] as const,
  list: () => [...systemQueryKeys.all, 'list'] as const,
};
