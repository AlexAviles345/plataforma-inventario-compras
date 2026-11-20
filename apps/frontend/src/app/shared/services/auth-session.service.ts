import type { IssuedTokenEntry } from '@shared/types/auth-session.types';
import { apiRequest } from './http-client';

const CSRF_COOKIE = 'td_csrf';

export interface RenewableAccessToken extends IssuedTokenEntry {
  tokens?: IssuedTokenEntry[];
}

let refreshInFlight: Promise<RenewableAccessToken> | null = null;

export function readCsrfToken(): string | undefined {
  const prefix = `${CSRF_COOKIE}=`;

  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;

    try {
      return decodeURIComponent(value.slice(prefix.length));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function hasRenewableSession(): boolean {
  return Boolean(readCsrfToken());
}

export function refreshSession(): Promise<RenewableAccessToken> {
  const csrfToken = readCsrfToken();
  if (!csrfToken) return Promise.reject(new Error('No hay sesión renovable'));

  if (!refreshInFlight) {
    refreshInFlight = apiRequest<RenewableAccessToken>({
      method: 'POST',
      url: '/api/auth/refresh',
      anonymous: true,
      headers: { 'X-CSRF-Token': csrfToken },
    })
      .then((result) => result.data)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function logoutSession(): Promise<void> {
  const csrfToken = readCsrfToken();
  await apiRequest<null>({
    method: 'POST',
    url: '/api/auth/logout',
    anonymous: true,
    ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
  });
}
