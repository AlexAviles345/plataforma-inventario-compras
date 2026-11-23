import { useState } from 'react';
import { Clock3, History } from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { StatusBadge } from '@shared/components/data-display/StatusBadge';
import { Button } from '@shared/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@shared/components/ui/sheet';
import { Skeleton } from '@shared/components/ui/skeleton';
import { formatUtcDateTime } from '@shared/utils/date-utc.util';

import { useOrderHistory } from '../hooks/useOrderHistory';

export function OrderHistorySheet({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const historyQuery = useOrderHistory(orderId, open);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <History /> Historial
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Historial de la orden</SheetTitle>
          <SheetDescription>
            Registro cronológico de movimientos y actualizaciones.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {historyQuery.isLoading && (
            <>
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </>
          )}
          {historyQuery.error && <ApiErrorAlert error={historyQuery.error} />}
          {historyQuery.data?.map((entry) => (
            <article key={entry.id} className="relative rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={entry.action} />
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <Clock3 className="size-4 text-muted-foreground" />
                    {formatUtcDateTime(entry.createdAt)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {entry.fromStatus ?? '—'} → {entry.toStatus}
                </span>
              </div>
              <dl className="mt-4 space-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Realizado por</dt>
                  <dd className="break-all font-mono">{entry.actorUserId}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
