import { Clock3, ShieldCheck } from 'lucide-react';

import { Badge } from '@shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import type {
  SystemCode,
  SystemSession,
} from '@shared/types/auth-session.types';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';
import { formatUtcDateTime } from '@shared/utils/date-utc.util';

const SYSTEM_LABELS: Record<SystemCode, string> = {
  INVENTORY: 'Inventario',
  PURCHASES: 'Compras',
};

export function ActiveSystemSessionCard() {
  const sessions = useAuthSessionStore((state) => state.sessions);
  const validSessions = (['INVENTORY', 'PURCHASES'] as const)
    .map((system) => sessions[system])
    .filter((session): session is SystemSession =>
      Boolean(session && !isAccessTokenExpired(session.claims)),
    );

  if (validSessions.length === 0) return null;

  const primarySession = validSessions[0];
  const distinctRoles = Array.from(
    new Set(validSessions.map((session) => session.claims.role)),
  );
  const roleLabel =
    distinctRoles.length === 1
      ? distinctRoles[0]
      : validSessions
          .map(
            (session) =>
              `${SYSTEM_LABELS[session.claims.system]}: ${session.claims.role}`,
          )
          .join(' · ');
  const earliestExpiration = Math.min(
    ...validSessions.map((session) => session.claims.exp),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Sesión activa</CardTitle>
            <CardDescription>{primarySession.claims.email}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {validSessions.map((session) => (
              <Badge key={session.claims.system} variant="secondary">
                {SYSTEM_LABELS[session.claims.system]}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
          <ShieldCheck className="size-5 text-teal-700 dark:text-teal-300" />
          <div>
            <p className="text-xs text-muted-foreground">Rol asignado</p>
            <p className="text-sm font-semibold">{roleLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
          <Clock3 className="size-5 text-teal-700 dark:text-teal-300" />
          <div>
            <p className="text-xs text-muted-foreground">Expira</p>
            <p className="text-sm font-semibold">
              {formatUtcDateTime(
                new Date(earliestExpiration * 1_000).toISOString(),
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
