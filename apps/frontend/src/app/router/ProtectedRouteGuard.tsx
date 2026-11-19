import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { refreshSession } from '@shared/services/auth-session.service';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import type {
  SystemCode,
  SystemSession,
} from '@shared/types/auth-session.types';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';

export function ProtectedRouteGuard() {
  const location = useLocation();
  const sessions = useAuthSessionStore((state) => state.sessions);
  const removeSystemSession = useAuthSessionStore(
    (state) => state.removeSystemSession,
  );
  const renewableSystem = useAuthSessionStore((state) => state.renewableSystem);
  const setRenewableSessionBundle = useAuthSessionStore(
    (state) => state.setRenewableSessionBundle,
  );

  const valid = Object.values(sessions).some(
    (entry) => entry && !isAccessTokenExpired(entry.claims),
  );

  useEffect(() => {
    const entries = (
      Object.entries(sessions) as Array<[SystemCode, SystemSession | undefined]>
    ).filter((entry): entry is [SystemCode, SystemSession] =>
      Boolean(entry[1] && !isAccessTokenExpired(entry[1].claims)),
    );
    if (entries.length === 0) return;

    const [targetSystem, targetSession] = entries.reduce((earliest, current) =>
      current[1].claims.exp < earliest[1].claims.exp ? current : earliest,
    );

    const renewable = Boolean(renewableSystem);
    const renewAt = renewable ? 30_000 : 0;
    const milliseconds = Math.max(
      targetSession.claims.exp * 1_000 - Date.now() - renewAt,
      0,
    );
    const timeout = window.setTimeout(() => {
      if (!renewable) {
        removeSystemSession(targetSystem);
        return;
      }

      void refreshSession()
        .then((response) =>
          setRenewableSessionBundle(
            response.accessToken,
            response.tokens?.map((entry) => entry.accessToken),
          ),
        )
        .catch(() => removeSystemSession(targetSystem));
    }, milliseconds);
    return () => window.clearTimeout(timeout);
  }, [
    removeSystemSession,
    renewableSystem,
    sessions,
    setRenewableSessionBundle,
  ]);

  if (!valid) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <Outlet />;
}
