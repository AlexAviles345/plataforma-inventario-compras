import { ArrowLeft, Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { StatusBadge } from '@shared/components/data-display/StatusBadge';
import { Button } from '@shared/components/ui/button';
import { Skeleton } from '@shared/components/ui/skeleton';

import { OrderCancelDialog } from '../components/OrderCancelDialog';
import { OrderDetailPanel } from '../components/OrderDetailPanel';
import { OrderHistorySheet } from '../components/OrderHistorySheet';
import { OrderSubmitConfirmDialog } from '../components/OrderSubmitConfirmDialog';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useOrderMutations } from '../hooks/useOrderMutations';

export function OrderDetailPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const orderQuery = useOrderDetail(orderId);
  const { submitMutation, cancelMutation } = useOrderMutations(orderId);

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (orderQuery.error || !orderQuery.data) {
    return (
      <ApiErrorAlert
        error={orderQuery.error ?? new Error('La orden no está disponible')}
      />
    );
  }

  const order = orderQuery.data;
  const reload = () => {
    submitMutation.reset();
    cancelMutation.reset();
    void orderQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link to="/purchases/orders">
              <ArrowLeft /> Volver a órdenes
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              Orden {order.id.slice(0, 8)}…
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {order.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderHistorySheet orderId={order.id} />
          {order.status === 'DRAFT' && (
            <>
              <Button asChild variant="outline">
                <Link to={`/purchases/orders/${order.id}/edit`}>
                  <Pencil /> Editar
                </Link>
              </Button>
              <OrderSubmitConfirmDialog
                order={order}
                mutation={submitMutation}
                onReload={reload}
              />
            </>
          )}
          {order.status !== 'CANCELLED' && (
            <OrderCancelDialog
              order={order}
              mutation={cancelMutation}
              onReload={reload}
            />
          )}
        </div>
      </header>

      <OrderDetailPanel order={order} />
    </div>
  );
}
