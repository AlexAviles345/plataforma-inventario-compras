import { type PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import type {
  SystemCode,
  SystemSession,
  UserRole,
} from '@shared/types/auth-session.types';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';

interface SystemTokenGuardProps extends PropsWithChildren {
  system?: SystemCode;
  roles?: UserRole[];
}

export function SystemTokenGuard({
  system,
  roles,
  children,
}: SystemTokenGuardProps) {
  const location = useLocation();
  const sessions = useAuthSessionStore((state) => state.sessions);

  const validSessions = Object.values(sessions).filter(
    (session): session is SystemSession =>
      Boolean(session && !isAccessTokenExpired(session.claims)),
  );

  if (validSessions.length === 0) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (system) {
    const systemSession = sessions[system];
    if (!systemSession || isAccessTokenExpired(systemSession.claims)) {
      return <Navigate to="/forbidden" replace />;
    }
    if (roles && !roles.includes(systemSession.claims.role)) {
      return <Navigate to="/forbidden" replace />;
    }
    return children;
  }

  if (
    roles &&
    !validSessions.some((session) => roles.includes(session.claims.role))
  ) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
