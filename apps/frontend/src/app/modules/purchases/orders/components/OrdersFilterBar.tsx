import { useState, type FormEvent } from 'react';
import { Filter, RotateCcw } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/components/ui/select';

import type { PurchaseOrderStatus } from '../types/purchase-orders.types';

interface OrdersFilterBarProps {
  status?: PurchaseOrderStatus;
  requesterId?: string;
  showRequester: boolean;
  onChange: (filters: {
    status?: PurchaseOrderStatus;
    requesterId?: string;
  }) => void;
}

export function OrdersFilterBar({
  status,
  requesterId,
  showRequester,
  onChange,
}: OrdersFilterBarProps) {
  const [requester, setRequester] = useState(requesterId ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ status, requesterId: requester.trim() || undefined });
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[minmax(12rem,0.6fr)_1fr_auto] md:items-end"
    >
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select
          value={status ?? 'ALL'}
          onValueChange={(value) =>
            onChange({
              status:
                value === 'ALL' ? undefined : (value as PurchaseOrderStatus),
              requesterId: requester.trim() || undefined,
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="DRAFT">Borrador</SelectItem>
            <SelectItem value="SUBMITTED">Enviada</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showRequester ? (
        <div className="space-y-2">
          <Label htmlFor="requesterId">UUID del solicitante</Label>
          <Input
            id="requesterId"
            value={requester}
            onChange={(event) => setRequester(event.target.value)}
            placeholder="Filtrar órdenes de un usuario"
          />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Se muestran únicamente tus órdenes.
        </div>
      )}
      <div className="flex gap-2">
        {showRequester && (
          <Button type="submit" variant="outline">
            <Filter /> Aplicar
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Limpiar filtros"
          onClick={() => {
            setRequester('');
            onChange({});
          }}
        >
          <RotateCcw />
        </Button>
      </div>
    </form>
  );
}
