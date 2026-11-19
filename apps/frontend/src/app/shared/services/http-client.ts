import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import {
  getActiveSystemSession,
  getValidSessions,
  getValidSystemSession,
  useAuthSessionStore,
} from '@shared/stores/auth-session.store';
import type {
  ApiSuccessResponse,
  PaginationMeta,
} from '@shared/types/api-envelope.types';
import type { SystemCode } from '@shared/types/auth-session.types';
import { GatewayApiError, normalizeGatewayError } from './gateway-api-error';

interface GatewayRequestMetadata {
  anonymous?: boolean;
  requiredSystem?: SystemCode;
  idempotencyKey?: string;
}

type InternalGatewayRequestConfig = InternalAxiosRequestConfig &
  GatewayRequestMetadata;

export type GatewayRequestConfig<D = unknown> = AxiosRequestConfig<D> &
  GatewayRequestMetadata;

export interface GatewayResult<T> {
  data: T;
  message: string;
  statusCode: number;
  meta?: PaginationMeta;
  requestId?: string;
}

function inferRequiredSystem(url?: string): SystemCode | undefined {
  if (url?.startsWith('/api/inventory/')) return 'INVENTORY';
  if (url?.startsWith('/api/purchases/')) return 'PURCHASES';
  return undefined;
}

function resolveSession(config: InternalGatewayRequestConfig) {
  const requiredSystem =
    config.requiredSystem ?? inferRequiredSystem(config.url);

  if (requiredSystem) return getValidSystemSession(requiredSystem);

  if (config.url?.startsWith('/api/auth/')) {
    return getValidSessions().find(
      (session) => session.claims.role === 'ADMIN',
    );
  }

  return getActiveSystemSession();
}

function isSuccessEnvelope<T>(value: unknown): value is ApiSuccessResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiSuccessResponse<T>>;

  return (
    candidate.error === false &&
    typeof candidate.statusCode === 'number' &&
    typeof candidate.message === 'string' &&
    'data' in candidate
  );
}

const gatewayClient = axios.create({
  headers: { Accept: 'application/json' },
  timeout: 15_000,
  withCredentials: true,
});

gatewayClient.interceptors.request.use((request) => {
  const config = request as InternalGatewayRequestConfig;
  const headers = AxiosHeaders.from(config.headers);

  headers.set('X-Request-Id', crypto.randomUUID());

  if (config.idempotencyKey) {
    headers.set('Idempotency-Key', config.idempotencyKey);
  }

  if (!config.anonymous) {
    const session = resolveSession(config);
    if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  config.headers = headers;
  return config;
});

gatewayClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeGatewayError(error);

    if (
      normalized.statusCode === 401 &&
      (normalized.code === 'AUTHENTICATION_REQUIRED' ||
        normalized.code === 'INVALID_TOKEN') &&
      axios.isAxiosError(error)
    ) {
      const config = error.config as InternalGatewayRequestConfig | undefined;
      const system = config?.requiredSystem ?? inferRequiredSystem(config?.url);

      if (system) useAuthSessionStore.getState().removeSystemSession(system);
    }

    return Promise.reject(normalized);
  },
);

export async function apiRequest<T, D = unknown>(
  config: GatewayRequestConfig<D>,
): Promise<GatewayResult<T>> {
  const response = await gatewayClient.request<ApiSuccessResponse<T>>(config);

  if (!isSuccessEnvelope<T>(response.data)) {
    throw new GatewayApiError('La respuesta no cumple el contrato del API', {
      statusCode: response.status,
      code: 'INVALID_API_RESPONSE',
      source: 'gateway',
      requestId: response.headers['x-request-id'] as string | undefined,
    });
  }

  if (response.data.statusCode !== response.status) {
    throw new GatewayApiError('El status HTTP no coincide con la respuesta', {
      statusCode: response.status,
      code: 'INVALID_API_RESPONSE',
      source: 'gateway',
      requestId: response.headers['x-request-id'] as string | undefined,
    });
  }

  return {
    data: response.data.data,
    message: response.data.message,
    statusCode: response.data.statusCode,
    meta: response.data.meta,
    requestId: response.headers['x-request-id'] as string | undefined,
  };
}
