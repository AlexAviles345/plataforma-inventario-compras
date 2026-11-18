import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { refreshSession } from '@shared/services/auth-session.service';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';

export function ProtectedRouteGuard() {
  const location = useLocation();
  const activeSystem = useAuthSessionStore((state) => state.activeSystem);
  const session = useAuthSessionStore((state) =>
    state.activeSystem ? state.sessions[state.activeSystem] : undefined,
  );
  const removeSystemSession = useAuthSessionStore(
    (state) => state.removeSystemSession,
  );
  const renewableSystem = useAuthSessionStore((state) => state.renewableSystem);
  const setRenewableAccessToken = useAuthSessionStore(
    (state) => state.setRenewableAccessToken,
  );
  const valid = Boolean(session && !isAccessTokenExpired(session.claims));

  useEffect(() => {
    if (!activeSystem || !session) return;

    const renewable = renewableSystem === activeSystem;
    const renewAt = renewable ? 30_000 : 0;
    const milliseconds = Math.max(
      session.claims.exp * 1_000 - Date.now() - renewAt,
      0,
    );
    const timeout = window.setTimeout(() => {
      if (!renewable) {
        removeSystemSession(activeSystem);
        return;
      }

      void refreshSession()
        .then((response) => setRenewableAccessToken(response.accessToken))
        .catch(() => removeSystemSession(activeSystem));
    }, milliseconds);
    return () => window.clearTimeout(timeout);
  }, [
    activeSystem,
    removeSystemSession,
    renewableSystem,
    session,
    setRenewableAccessToken,
  ]);

  if (!valid) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <Outlet />;
}
