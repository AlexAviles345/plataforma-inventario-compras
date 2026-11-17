import { Clock3, ShieldCheck } from 'lucide-react';

import { Badge } from '@shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import {
  selectActiveSession,
  useAuthSessionStore,
} from '@shared/stores/auth-session.store';
import { formatUtcDateTime } from '@shared/utils/date-utc.util';

export function ActiveSystemSessionCard() {
  const session = useAuthSessionStore(selectActiveSession);

  if (!session) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Sesión activa</CardTitle>
            <CardDescription>{session.claims.email}</CardDescription>
          </div>
          <Badge variant="secondary">{session.claims.system}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
          <ShieldCheck className="size-5 text-teal-700 dark:text-teal-300" />
          <div>
            <p className="text-xs text-muted-foreground">Rol asignado</p>
            <p className="text-sm font-semibold">{session.claims.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
          <Clock3 className="size-5 text-teal-700 dark:text-teal-300" />
          <div>
            <p className="text-xs text-muted-foreground">Expira</p>
            <p className="text-sm font-semibold">
              {formatUtcDateTime(
                new Date(session.claims.exp * 1_000).toISOString(),
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
