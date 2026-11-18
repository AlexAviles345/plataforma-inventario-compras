import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Skeleton } from '@shared/components/ui/skeleton';
import {
  hasRenewableSession,
  refreshSession,
} from '@shared/services/auth-session.service';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';

function safeReturnPath(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

function SessionLoader() {
  return (
    <div
      className="mx-auto max-w-5xl space-y-4 p-8"
      aria-label="Restaurando sesión"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function SessionBootstrap({ children }: PropsWithChildren) {
  const location = useLocation();
  const initialLocation = useRef(location);
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const setRenewableAccessToken = useAuthSessionStore(
    (state) => state.setRenewableAccessToken,
  );

  useEffect(() => {
    let mounted = true;

    async function restore() {
      if (!hasRenewableSession()) {
        if (mounted) setReady(true);
        return;
      }

      try {
        const response = await refreshSession();
        if (!mounted) return;
        setRenewableAccessToken(response.accessToken);

        if (initialLocation.current.pathname === '/login') {
          const search = new URLSearchParams(initialLocation.current.search);
          navigate(safeReturnPath(search.get('returnTo')), { replace: true });
        }
      } catch {
        // Auth limpia las cookies inválidas. Sin sesión, las rutas protegidas
        // redirigen al login de forma normal.
      } finally {
        if (mounted) setReady(true);
      }
    }

    void restore();
    return () => {
      mounted = false;
    };
  }, [navigate, setRenewableAccessToken]);

  return ready ? children : <SessionLoader />;
}
