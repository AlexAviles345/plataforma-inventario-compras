import { useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { LoaderCircle, Send } from 'lucide-react';

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

interface SubmitVariables {
  expectedVersion: number;
  idempotencyKey: string;
}

interface OrderSubmitConfirmDialogProps {
  order: PurchaseOrder;
  mutation: UseMutationResult<PurchaseOrder, Error, SubmitVariables>;
  onReload: () => void;
}

export function OrderSubmitConfirmDialog({
  order,
  mutation,
  onReload,
}: OrderSubmitConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const submit = () =>
    mutation.mutate(
      { expectedVersion: order.version, idempotencyKey },
      { onSuccess: () => setOpen(false) },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send /> Enviar orden
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar orden de compra</DialogTitle>
          <DialogDescription>
            Una vez enviada, la orden quedará confirmada y sus líneas ya no
            podrán modificarse.
          </DialogDescription>
        </DialogHeader>
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
          <Button type="button" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Send />
            )}
            {mutation.isPending ? 'Enviando…' : 'Confirmar envío'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
