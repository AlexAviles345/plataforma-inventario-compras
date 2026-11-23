import { AlertTriangle } from 'lucide-react';

interface ApiErrorAlertProps {
  error: unknown;
  title?: string;
}

export function ApiErrorAlert({
  error,
  title = 'No fue posible completar la operación',
}: ApiErrorAlertProps) {
  const message = error instanceof Error ? error.message : 'Error inesperado';

  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold text-destructive">{title}</p>
          <p className="mt-1 text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}
