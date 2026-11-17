import { QueryClient } from '@tanstack/react-query';

import { GatewayApiError } from '@shared/services/gateway-api-error';

const MAX_PROJECTION_RETRIES = 4;
const DEFAULT_RETRY_AFTER_MS = 2_000;

export function isProjectionNotReady(error: unknown): boolean {
  return (
    error instanceof GatewayApiError && error.code === 'PROJECTION_NOT_READY'
  );
}

export function projectionRetry(failureCount: number, error: unknown): boolean {
  return isProjectionNotReady(error) && failureCount < MAX_PROJECTION_RETRIES;
}

export function projectionRetryDelay(_: number, error: unknown): number {
  if (
    error instanceof GatewayApiError &&
    error.retryAfterSeconds !== undefined
  ) {
    return error.retryAfterSeconds * 1_000;
  }
  return DEFAULT_RETRY_AFTER_MS;
}

export const projectionRetryOptions = {
  retry: projectionRetry,
  retryDelay: projectionRetryDelay,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: projectionRetry,
      retryDelay: projectionRetryDelay,
    },
    mutations: { retry: false },
  },
});
