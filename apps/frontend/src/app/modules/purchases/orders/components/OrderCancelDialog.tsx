import { useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { Ban, LoaderCircle } from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/components/ui/dialog';

import type { PurchaseOrder } from '../types/purchase-orders.types';
import { VersionConflictAlert } from './VersionConflictAlert';

interface CancelVariables {
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}

interface OrderCancelDialogProps {
  order: PurchaseOrder;
  mutation: UseMutationResult<PurchaseOrder, Error, CancelVariables>;
  onReload: () => void;
}

export function OrderCancelDialog({
  order,
  mutation,
  onReload,
}: OrderCancelDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const cancel = () =>
    mutation.mutate(
      {
        expectedVersion: order.version,
        idempotencyKey,
        reason: reason.trim() || undefined,
      },
      { onSuccess: () => setOpen(false) },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Ban /> Cancelar orden
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar orden de compra</DialogTitle>
          <DialogDescription>
            Esta transición es terminal. La orden conservará sus snapshots y su
            historial para auditoría.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="cancelReason" className="text-sm font-medium">
            Motivo opcional
          </label>
          <textarea
            id="cancelReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            disabled={mutation.isPending}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-right text-xs text-muted-foreground">
            {reason.length}/500
          </p>
        </div>
        <VersionConflictAlert error={mutation.error} onReload={onReload} />
        {mutation.error && <ApiErrorAlert error={mutation.error} />}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Volver
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={cancel}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Ban />
            )}
            {mutation.isPending ? 'Cancelando…' : 'Confirmar cancelación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
