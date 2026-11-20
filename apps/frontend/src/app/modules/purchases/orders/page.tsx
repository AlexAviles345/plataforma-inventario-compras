import { Plus, ShoppingCart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Button } from '@shared/components/ui/button';
import { Skeleton } from '@shared/components/ui/skeleton';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';

import { OrdersFilterBar } from './components/OrdersFilterBar';
import { OrdersPagination } from './components/OrdersPagination';
import { OrdersSummaryCards } from './components/OrdersSummaryCards';
import { OrdersTable } from './components/OrdersTable';
import { useOrdersList } from './hooks/useOrdersList';
import {
  ORDER_STATUSES,
  type OrdersListFilters,
  type PurchaseOrderStatus,
} from './types/purchase-orders.types';

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isOrderStatus(value: string | null): value is PurchaseOrderStatus {
  return Boolean(
    value && (ORDER_STATUSES as readonly string[]).includes(value),
  );
}

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const purchaseSession = useAuthSessionStore(
    (state) => state.sessions.PURCHASES,
  );
  const isAdmin = purchaseSession?.claims.role === 'ADMIN';
  const filters: OrdersListFilters = {
    page: positiveInteger(searchParams.get('page'), 1),
    limit: Math.min(positiveInteger(searchParams.get('limit'), 20), 100),
    status: isOrderStatus(searchParams.get('status'))
      ? (searchParams.get('status') as PurchaseOrderStatus)
      : undefined,
    requesterId: isAdmin
      ? (searchParams.get('requesterId') ?? undefined)
      : undefined,
  };
  const ordersQuery = useOrdersList(filters);

  const updateFilters = (next: {
    status?: PurchaseOrderStatus;
    requesterId?: string;
  }) => {
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('limit', String(filters.limit));
    if (next.status) params.set('status', next.status);
    if (isAdmin && next.requesterId) {
      params.set('requesterId', next.requesterId);
    }
    setSearchParams(params);
  };
  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(page));
    setSearchParams(params);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300">
            <ShoppingCart className="size-4" /> Compras
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Órdenes de compra
          </h1>
          <p className="mt-2 text-muted-foreground">
            Captura, revisa y controla el ciclo de vida de las órdenes.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/purchases/orders/new">
            <Plus /> Nueva orden
          </Link>
        </Button>
      </header>

      <OrdersFilterBar
        key={`${filters.status ?? 'ALL'}-${filters.requesterId ?? ''}`}
        status={filters.status}
        requesterId={filters.requesterId}
        showRequester={isAdmin}
        onChange={updateFilters}
      />

      {ordersQuery.isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      )}

      {ordersQuery.error && <ApiErrorAlert error={ordersQuery.error} />}

      {ordersQuery.data && (
        <>
          <OrdersSummaryCards
            orders={ordersQuery.data.orders}
            total={ordersQuery.data.meta.total}
          />
          {ordersQuery.data.orders.length > 0 ? (
            <OrdersTable
              orders={ordersQuery.data.orders}
              showRequester={isAdmin}
            />
          ) : (
            <div className="rounded-xl border border-dashed bg-card py-16 text-center">
              <ShoppingCart className="mx-auto size-9 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">No hay órdenes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajusta los filtros o crea la primera orden de compra.
              </p>
            </div>
          )}
          <OrdersPagination
            meta={ordersQuery.data.meta}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
