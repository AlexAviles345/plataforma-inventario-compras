import { Boxes, Clock3, Pencil, ShoppingCart, ShieldCheck } from 'lucide-react';

import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import { formatUtcDateTime } from '@shared/utils/date-utc.util';

import type { AuthSystemConfiguration } from '../types/systems-admin.types';

export function SystemsCatalogCards({
  systems,
  onEdit,
}: {
  systems: AuthSystemConfiguration[];
  onEdit: (system: AuthSystemConfiguration) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {systems.map((system) => {
        const Icon = system.code === 'INVENTORY' ? Boxes : ShoppingCart;
        return (
          <Card key={system.code}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                  <Icon />
                </span>
                <div>
                  <CardTitle>{system.code}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Versión {system.version}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">
                <ShieldCheck /> Configurado
              </Badge>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl bg-muted/60 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="size-4" /> Vigencia de access token
                </div>
                <p className="mt-2 text-3xl font-semibold">
                  {(system.accessTokenTtlSeconds / 60).toLocaleString('es-MX', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  <span className="text-base font-normal text-muted-foreground">
                    minutos
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {system.accessTokenTtlSeconds.toLocaleString('es-MX')}{' '}
                  segundos
                </p>
              </div>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground">
                  Actualizado {formatUtcDateTime(system.updatedAt)}
                </p>
                <Button variant="outline" onClick={() => onEdit(system)}>
                  <Pencil /> Cambiar vigencia
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
