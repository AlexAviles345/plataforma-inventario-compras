import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@shared/components/ui/button';

export function AccessDeniedPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold">Acceso no autorizado</h1>
      <p className="mt-3 text-muted-foreground">
        No cuentas con permisos para acceder a esta sección.
      </p>
      <Button asChild className="mt-6">
        <Link to="/dashboard">Volver al resumen</Link>
      </Button>
    </div>
  );
}
