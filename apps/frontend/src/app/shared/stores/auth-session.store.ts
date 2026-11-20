import { create } from 'zustand';

import type {
  AccessTokenClaims,
  SystemCode,
  SystemSession,
  SystemSessions,
} from '@shared/types/auth-session.types';
import {
  InvalidAccessTokenError,
  decodeAndValidateAccessToken,
  isAccessTokenExpired,
} from '@shared/utils/access-token.util';

interface AuthSessionState {
  sessions: SystemSessions;
  activeSystem: SystemCode | null;
  renewableSystem: SystemCode | null;
  setAccessToken: (accessToken: string) => AccessTokenClaims;
  setRenewableAccessToken: (accessToken: string) => AccessTokenClaims;
  setRenewableSessionBundle: (
    primaryToken: string,
    additionalTokens?: string[],
  ) => AccessTokenClaims;
  setActiveSystem: (system: SystemCode) => boolean;
  removeSystemSession: (system: SystemCode) => void;
  clearSession: () => void;
}

export const useAuthSessionStore = create<AuthSessionState>((set, get) => ({
  sessions: {},
  activeSystem: null,
  renewableSystem: null,
  setAccessToken: (accessToken) => installAccessToken(accessToken, false),
  setRenewableAccessToken: (accessToken) =>
    installAccessToken(accessToken, true),
  setRenewableSessionBundle: (primaryToken, additionalTokens) =>
    installSessionBundle(primaryToken, additionalTokens, true),
  setActiveSystem: (system) => {
    const session = get().sessions[system];

    if (!session || isAccessTokenExpired(session.claims)) {
      if (session) get().removeSystemSession(system);
      return false;
    }

    set({ activeSystem: system });
    return true;
  },
  removeSystemSession: (system) =>
    set((state) => {
      const sessions = { ...state.sessions };
      delete sessions[system];

      const fallbackSystem = Object.keys(sessions).find(
        (candidate) => sessions[candidate as SystemCode],
      ) as SystemCode | undefined;

      return {
        sessions,
        activeSystem:
          state.activeSystem === system
            ? (fallbackSystem ?? null)
            : state.activeSystem,
        renewableSystem:
          state.renewableSystem === system ? null : state.renewableSystem,
      };
    }),
  clearSession: () =>
    set({ sessions: {}, activeSystem: null, renewableSystem: null }),
}));

function installAccessToken(
  accessToken: string,
  renewable: boolean,
): AccessTokenClaims {
  const store = useAuthSessionStore.getState();
  const normalizedToken = accessToken.trim();
  const claims = decodeAndValidateAccessToken(normalizedToken);
  const belongsToAnotherUser = Object.values(store.sessions).some(
    (session) => session.claims.sub !== claims.sub,
  );

  if (belongsToAnotherUser) {
    throw new InvalidAccessTokenError(
      'No se pueden combinar sesiones de usuarios distintos en la misma ventana',
    );
  }

  const session: SystemSession = { accessToken: normalizedToken, claims };

  useAuthSessionStore.setState((state) => ({
    sessions: { ...state.sessions, [claims.system]: session },
    activeSystem: claims.system,
    renewableSystem: renewable
      ? claims.system
      : state.renewableSystem === claims.system
        ? null
        : state.renewableSystem,
  }));

  return claims;
}

function installSessionBundle(
  primaryToken: string,
  additionalTokens: string[] | undefined,
  renewable: boolean,
): AccessTokenClaims {
  const normalizedPrimary = primaryToken.trim();
  const primaryClaims = decodeAndValidateAccessToken(normalizedPrimary);
  const bundledSessions: SystemSessions = {
    [primaryClaims.system]: {
      accessToken: normalizedPrimary,
      claims: primaryClaims,
    },
  };

  for (const rawToken of additionalTokens ?? []) {
    const trimmed = rawToken.trim();
    if (!trimmed) continue;
    const claims = decodeAndValidateAccessToken(trimmed);
    if (claims.sub !== primaryClaims.sub) {
      throw new InvalidAccessTokenError(
        'No se pueden combinar sesiones de usuarios distintos en la misma ventana',
      );
    }
    bundledSessions[claims.system] = { accessToken: trimmed, claims };
  }

  useAuthSessionStore.setState((state) => {
    const storeHasDifferentUser = Object.values(state.sessions).some(
      (session) => session && session.claims.sub !== primaryClaims.sub,
    );
    const hasExplicitBundle =
      Array.isArray(additionalTokens) && additionalTokens.length > 0;
    const nextSessions: SystemSessions =
      hasExplicitBundle || storeHasDifferentUser
        ? bundledSessions
        : { ...state.sessions, ...bundledSessions };

    return {
      sessions: nextSessions,
      activeSystem: primaryClaims.system,
      renewableSystem: renewable
        ? primaryClaims.system
        : state.renewableSystem === primaryClaims.system
          ? null
          : state.renewableSystem,
    };
  });

  return primaryClaims;
}

export function getValidSystemSession(
  system: SystemCode,
): SystemSession | undefined {
  const store = useAuthSessionStore.getState();
  const session = store.sessions[system];

  if (!session || !isAccessTokenExpired(session.claims)) return session;

  store.removeSystemSession(system);
  return undefined;
}

export function getValidSessions(): SystemSession[] {
  const { sessions } = useAuthSessionStore.getState();
  return (Object.keys(sessions) as SystemCode[])
    .map((system) => getValidSystemSession(system))
    .filter((session): session is SystemSession => Boolean(session));
}

export function getActiveSystemSession(): SystemSession | undefined {
  const { activeSystem } = useAuthSessionStore.getState();
  return (
    (activeSystem ? getValidSystemSession(activeSystem) : undefined) ??
    getValidSessions()[0]
  );
}

export const selectActiveSession = (
  state: AuthSessionState,
): SystemSession | undefined =>
  (state.activeSystem ? state.sessions[state.activeSystem] : undefined) ??
  Object.values(state.sessions).find(Boolean);

export const selectIsAdmin = (state: AuthSessionState): boolean =>
  Object.values(state.sessions).some(
    (session) => session?.claims.role === 'ADMIN',
  );

export const selectCanAccessInventory = (state: AuthSessionState): boolean =>
  Boolean(state.sessions.INVENTORY);

export const selectCanAccessPurchases = (state: AuthSessionState): boolean =>
  Boolean(state.sessions.PURCHASES);
