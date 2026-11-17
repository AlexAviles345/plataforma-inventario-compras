import { RefreshCw } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import { GatewayApiError } from '@shared/services/gateway-api-error';

interface VersionConflictAlertProps {
  error: unknown;
  onReload: () => void;
}

export function VersionConflictAlert({
  error,
  onReload,
}: VersionConflictAlertProps) {
  if (
    !(error instanceof GatewayApiError) ||
    !['VERSION_CONFLICT', 'ORDER_STATE_CONFLICT'].includes(error.code)
  ) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-semibold">La orden cambió en otra operación</p>
      <p className="mt-1 opacity-80">{error.message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={onReload}
      >
        <RefreshCw /> Recargar versión actual
      </Button>
    </div>
  );
}
