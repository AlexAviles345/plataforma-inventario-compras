import type { Request, Response } from 'express';
import type { RefreshCredentials } from './refresh-session.service';

export const REFRESH_COOKIE = 'td_refresh';
export const CSRF_COOKIE = 'td_csrf';

export function readCookie(request: Request, name: string): string | undefined {
  for (const item of request.headers.cookie?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setSessionCookies(
  response: Response,
  credentials: RefreshCredentials,
  secure: boolean,
): void {
  const common = {
    secure,
    sameSite: 'strict' as const,
    maxAge: credentials.maxAgeSeconds * 1_000,
  };
  response.cookie(REFRESH_COOKIE, credentials.refreshToken, {
    ...common,
    httpOnly: true,
    path: '/api/auth',
  });
  response.cookie(CSRF_COOKIE, credentials.csrfToken, {
    ...common,
    httpOnly: false,
    path: '/',
  });
}

export function clearSessionCookies(response: Response, secure: boolean): void {
  const common = { secure, sameSite: 'strict' as const };
  response.clearCookie(REFRESH_COOKIE, {
    ...common,
    httpOnly: true,
    path: '/api/auth',
  });
  response.clearCookie(CSRF_COOKIE, {
    ...common,
    httpOnly: false,
    path: '/',
  });
}
