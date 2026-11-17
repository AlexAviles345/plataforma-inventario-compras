import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

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
  const valid = Boolean(session && !isAccessTokenExpired(session.claims));

  useEffect(() => {
    if (!activeSystem || !session) return;

    const milliseconds = Math.max(session.claims.exp * 1_000 - Date.now(), 0);
    const timeout = window.setTimeout(
      () => removeSystemSession(activeSystem),
      milliseconds,
    );
    return () => window.clearTimeout(timeout);
  }, [activeSystem, removeSystemSession, session]);

  if (!valid) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <Outlet />;
}
