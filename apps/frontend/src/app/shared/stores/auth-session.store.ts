import { create } from 'zustand';

import type {
  AccessTokenClaims,
  SystemCode,
  SystemSession,
  SystemSessions,
} from '@shared/types/auth-session.types';
import {
  decodeAndValidateAccessToken,
  isAccessTokenExpired,
} from '@shared/utils/access-token.util';

interface AuthSessionState {
  sessions: SystemSessions;
  activeSystem: SystemCode | null;
  setAccessToken: (accessToken: string) => AccessTokenClaims;
  setActiveSystem: (system: SystemCode) => boolean;
  removeSystemSession: (system: SystemCode) => void;
  clearSession: () => void;
}

export const useAuthSessionStore = create<AuthSessionState>((set, get) => ({
  sessions: {},
  activeSystem: null,
  setAccessToken: (accessToken) => {
    const normalizedToken = accessToken.trim();
    const claims = decodeAndValidateAccessToken(normalizedToken);
    const session: SystemSession = { accessToken: normalizedToken, claims };

    set((state) => ({
      sessions: { ...state.sessions, [claims.system]: session },
      activeSystem: claims.system,
    }));

    return claims;
  },
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
      };
    }),
  clearSession: () => set({ sessions: {}, activeSystem: null }),
}));

export function getValidSystemSession(
  system: SystemCode,
): SystemSession | undefined {
  const store = useAuthSessionStore.getState();
  const session = store.sessions[system];

  if (!session || !isAccessTokenExpired(session.claims)) return session;

  store.removeSystemSession(system);
  return undefined;
}

export function getActiveSystemSession(): SystemSession | undefined {
  const { activeSystem } = useAuthSessionStore.getState();
  return activeSystem ? getValidSystemSession(activeSystem) : undefined;
}

export const selectActiveSession = (
  state: AuthSessionState,
): SystemSession | undefined =>
  state.activeSystem ? state.sessions[state.activeSystem] : undefined;

export const selectIsAdmin = (state: AuthSessionState): boolean =>
  selectActiveSession(state)?.claims.role === 'ADMIN';

export const selectCanAccessInventory = (state: AuthSessionState): boolean =>
  Boolean(state.sessions.INVENTORY);

export const selectCanAccessPurchases = (state: AuthSessionState): boolean =>
  Boolean(state.sessions.PURCHASES);
