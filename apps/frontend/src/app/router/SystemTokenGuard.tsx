import { useEffect, type PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import type { SystemCode, UserRole } from '@shared/types/auth-session.types';

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
  const activeSystem = useAuthSessionStore((state) => state.activeSystem);
  const sessions = useAuthSessionStore((state) => state.sessions);
  const setActiveSystem = useAuthSessionStore((state) => state.setActiveSystem);
  const requiredSession = system
    ? sessions[system]
    : activeSystem
      ? sessions[activeSystem]
      : undefined;

  useEffect(() => {
    if (system && requiredSession && activeSystem !== system) {
      setActiveSystem(system);
    }
  }, [activeSystem, requiredSession, setActiveSystem, system]);

  if (!requiredSession) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (roles && !roles.includes(requiredSession.claims.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
