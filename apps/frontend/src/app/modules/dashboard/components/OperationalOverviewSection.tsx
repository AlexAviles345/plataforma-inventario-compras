import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  getAdminUsersStats,
  listAdminUsers,
} from '@modules/administration/users/services/users-admin.service';
import { userQueryKeys } from '@modules/administration/users/hooks/user-query-keys';
import {
  getInventoryProductsStats,
  listProducts,
} from '@modules/inventory/products/services/products.service';
import { productQueryKeys } from '@modules/inventory/products/hooks/product-query-keys';
import type { ProductStockStatItem } from '@modules/inventory/products/types/products.types';
import {
  getPurchaseOrdersStats,
  listPurchaseOrders,
} from '@modules/purchases/orders/services/purchase-orders.service';
import { orderQueryKeys } from '@modules/purchases/orders/hooks/order-query-keys';
import type { TopSupplierStat } from '@modules/purchases/orders/types/purchase-orders.types';
import { StatusBadge } from '@shared/components/data-display/StatusBadge';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import {
  selectIsAdmin,
  useAuthSessionStore,
} from '@shared/stores/auth-session.store';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';
import { formatUtcDateTime } from '@shared/utils/date-utc.util';
import { formatMxn } from '@shared/utils/decimal-money.util';

const PREVIEW_FILTERS = { page: 1, limit: 5 } as const;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  INVENTORY_MANAGER: 'Gestor',
  PURCHASES_AGENT: 'Agente',
};

const SYSTEM_LABELS: Record<string, string> = {
  INVENTORY: 'Inventario',
  PURCHASES: 'Compras',
};

function DistributionBar({
  segments,
}: {
  segments: { value: number; className: string; label: string }[];
}) {
  const total = segments.reduce((acc, item) => acc + item.value, 0);
  if (total <= 0) {
    return <div className="h-2 w-full rounded-full bg-muted" />;
  }

  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      aria-label="Distribución proporcional"
    >
      {segments.map((segment) => {
        if (segment.value <= 0) return null;
        const pct = Math.max((segment.value / total) * 100, 4);
        return (
          <div
            key={segment.label}
            style={{ width: `${pct}%` }}
            title={`${segment.label}: ${segment.value}`}
            className={`h-full transition-all ${segment.className}`}
          />
        );
      })}
    </div>
  );
}

export function OperationalOverviewSection() {
  const sessions = useAuthSessionStore((state) => state.sessions);
  const isAdmin = useAuthSessionStore(selectIsAdmin);

  const hasInventory = Boolean(
    sessions.INVENTORY && !isAccessTokenExpired(sessions.INVENTORY.claims),
  );
  const hasPurchases = Boolean(
    sessions.PURCHASES && !isAccessTokenExpired(sessions.PURCHASES.claims),
  );

  const ordersStatsQuery = useQuery({
    queryKey: orderQueryKeys.stats(),
    queryFn: getPurchaseOrdersStats,
    enabled: hasPurchases,
    retry: false,
  });

  const productsStatsQuery = useQuery({
    queryKey: productQueryKeys.stats(),
    queryFn: getInventoryProductsStats,
    enabled: hasInventory,
    retry: false,
  });

  const usersStatsQuery = useQuery({
    queryKey: userQueryKeys.stats(),
    queryFn: getAdminUsersStats,
    enabled: isAdmin,
    retry: false,
  });

  const ordersQuery = useQuery({
    queryKey: orderQueryKeys.list(PREVIEW_FILTERS),
    queryFn: () => listPurchaseOrders(PREVIEW_FILTERS),
    enabled: hasPurchases,
    retry: false,
  });

  const productsQuery = useQuery({
    queryKey: productQueryKeys.list(PREVIEW_FILTERS),
    queryFn: () => listProducts(PREVIEW_FILTERS),
    enabled: hasInventory,
    retry: false,
  });

  const usersQuery = useQuery({
    queryKey: userQueryKeys.list(PREVIEW_FILTERS),
    queryFn: () => listAdminUsers(PREVIEW_FILTERS),
    enabled: isAdmin,
    retry: false,
  });

  const recentOrders = ordersQuery.data?.orders ?? [];
  const recentProducts = productsQuery.data?.products ?? [];
  const recentUsers = usersQuery.data?.users ?? [];

  const topSuppliers: TopSupplierStat[] = (() => {
    if (ordersStatsQuery.data?.topSuppliers?.length) {
      return ordersStatsQuery.data.topSuppliers;
    }
    const grouped = new Map<string, { orderCount: number; amount: number }>();
    for (const order of recentOrders) {
      if (order.status === 'CANCELLED') continue;
      const current = grouped.get(order.supplierName) ?? {
        orderCount: 0,
        amount: 0,
      };
      grouped.set(order.supplierName, {
        orderCount: current.orderCount + 1,
        amount: current.amount + Number(order.totalAmount || 0),
      });
    }
    return Array.from(grouped.entries())
      .map(([supplierName, val]) => ({
        supplierName,
        orderCount: val.orderCount,
        totalAmount: val.amount.toFixed(2),
      }))
      .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount))
      .slice(0, 5);
  })();

  const maxSupplierAmount = Math.max(
    ...topSuppliers.map((item) => Number(item.totalAmount) || 0),
    1,
  );

  const stockChartItems: ProductStockStatItem[] = (() => {
    if (productsStatsQuery.data?.topStockProducts?.length) {
      return productsStatsQuery.data.topStockProducts;
    }
    return recentProducts
      .filter((product) => product.active)
      .map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        stockOnHand: product.stockOnHand,
      }))
      .sort((a, b) => b.stockOnHand - a.stockOnHand)
      .slice(0, 5);
  })();

  const maxProductStock = Math.max(
    ...stockChartItems.map((item) => item.stockOnHand),
    1,
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Estadísticas generales</h2>
            <p className="text-sm text-muted-foreground">
              Indicadores principales de las áreas a las que tienes acceso.
            </p>
          </div>
          {hasPurchases && (
            <Button asChild size="sm">
              <Link to="/purchases/orders/new">
                <Plus className="size-4" />
                Nueva orden de compra
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {hasPurchases && (
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">Compras</CardTitle>
                  <CardDescription>
                    Órdenes e importes acumulados
                  </CardDescription>
                </div>
                <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                  <ShoppingCart className="size-4.5" />
                </span>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {ordersStatsQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : ordersStatsQuery.isError || !ordersStatsQuery.data ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
                    <AlertCircle className="size-4 shrink-0" />
                    Información no disponible por el momento.
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-3xl font-bold">
                        {ordersStatsQuery.data.totalOrders}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Órdenes registradas
                      </p>
                    </div>
                    <DistributionBar
                      segments={[
                        {
                          label: 'Enviadas',
                          value: ordersStatsQuery.data.submittedOrders,
                          className: 'bg-blue-600 dark:bg-blue-400',
                        },
                        {
                          label: 'Borrador',
                          value: ordersStatsQuery.data.draftOrders,
                          className: 'bg-amber-500 dark:bg-amber-400',
                        },
                        {
                          label: 'Canceladas',
                          value: ordersStatsQuery.data.cancelledOrders,
                          className: 'bg-slate-400 dark:bg-slate-600',
                        },
                      ]}
                    />
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
                      <div>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {ordersStatsQuery.data.submittedOrders}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Enviadas
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          {ordersStatsQuery.data.draftOrders}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Borrador
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          {ordersStatsQuery.data.cancelledOrders}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Canceladas
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 border-t pt-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Importe enviado:
                        </span>
                        <span className="font-mono font-semibold">
                          {formatMxn(ordersStatsQuery.data.submittedAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          En borrador:
                        </span>
                        <span className="font-mono font-medium">
                          {formatMxn(ordersStatsQuery.data.draftAmount)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {hasInventory && (
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">Inventario</CardTitle>
                  <CardDescription>
                    Catálogo y existencias totales
                  </CardDescription>
                </div>
                <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200">
                  <Boxes className="size-4.5" />
                </span>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {productsStatsQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : productsStatsQuery.isError || !productsStatsQuery.data ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
                    <AlertCircle className="size-4 shrink-0" />
                    Información no disponible por el momento.
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-3xl font-bold">
                        {productsStatsQuery.data.totalProducts}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Productos en catálogo
                      </p>
                    </div>
                    <DistributionBar
                      segments={[
                        {
                          label: 'Con existencias',
                          value: Math.max(
                            productsStatsQuery.data.activeProducts -
                              productsStatsQuery.data.outOfStockProducts,
                            0,
                          ),
                          className: 'bg-teal-600 dark:bg-teal-400',
                        },
                        {
                          label: 'Sin stock',
                          value: productsStatsQuery.data.outOfStockProducts,
                          className: 'bg-amber-500 dark:bg-amber-400',
                        },
                        {
                          label: 'Inactivos',
                          value: productsStatsQuery.data.inactiveProducts,
                          className: 'bg-slate-400 dark:bg-slate-600',
                        },
                      ]}
                    />
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
                      <div>
                        <p className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                          {productsStatsQuery.data.activeProducts}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Activos
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          {productsStatsQuery.data.outOfStockProducts}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Sin stock
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          {productsStatsQuery.data.inactiveProducts}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Inactivos
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3 text-xs">
                      <span className="text-muted-foreground">
                        Unidades totales en almacén:
                      </span>
                      <span className="font-mono font-semibold">
                        {productsStatsQuery.data.totalUnitsOnHand} uds.
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">Usuarios</CardTitle>
                  <CardDescription>
                    Cuentas registradas y acceso por área
                  </CardDescription>
                </div>
                <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                  <ShieldCheck className="size-4.5" />
                </span>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {usersStatsQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : usersStatsQuery.isError || !usersStatsQuery.data ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
                    <AlertCircle className="size-4 shrink-0" />
                    Información no disponible por el momento.
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-3xl font-bold">
                        {usersStatsQuery.data.totalUsers}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cuentas registradas ({usersStatsQuery.data.activeUsers}{' '}
                        activas · {usersStatsQuery.data.inactiveUsers}{' '}
                        inactivas)
                      </p>
                    </div>
                    <DistributionBar
                      segments={[
                        {
                          label: 'Activos',
                          value: usersStatsQuery.data.activeUsers,
                          className: 'bg-indigo-600 dark:bg-indigo-400',
                        },
                        {
                          label: 'Inactivos',
                          value: usersStatsQuery.data.inactiveUsers,
                          className: 'bg-slate-400 dark:bg-slate-600',
                        },
                      ]}
                    />
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
                      <div>
                        <p className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                          {usersStatsQuery.data.inventoryUsers}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Inventario
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {usersStatsQuery.data.purchasesUsers}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Compras
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          {usersStatsQuery.data.adminUsers}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Administradores
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3 text-xs">
                      <span className="text-muted-foreground">
                        Administración de accesos:
                      </span>
                      <Link
                        to="/administration/users"
                        className="font-medium text-teal-700 hover:underline dark:text-teal-300"
                      >
                        Gestionar cuentas →
                      </Link>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {(hasPurchases || hasInventory) && (
        <section className="grid gap-6 lg:grid-cols-2">
          {hasPurchases && (
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" />
                    Principales proveedores por importe
                  </CardTitle>
                  <CardDescription>
                    Distribución del monto de compras en órdenes activas.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {ordersStatsQuery.isLoading && ordersQuery.isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : ordersStatsQuery.isError && ordersQuery.isError ? (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    <AlertCircle className="size-4 shrink-0" />
                    Información no disponible por el momento.
                  </div>
                ) : topSuppliers.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    Registra órdenes de compra para visualizar la comparativa
                    por proveedor.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {topSuppliers.map((supplier) => {
                      const amount = Number(supplier.totalAmount) || 0;
                      const widthPct = Math.max(
                        Math.round((amount / maxSupplierAmount) * 100),
                        6,
                      );
                      return (
                        <div
                          key={supplier.supplierName}
                          className="space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate font-medium">
                              {supplier.supplierName}
                            </span>
                            <span className="shrink-0 font-mono text-xs font-semibold">
                              {formatMxn(supplier.totalAmount)}{' '}
                              <span className="font-sans font-normal text-muted-foreground">
                                ({supplier.orderCount}{' '}
                                {supplier.orderCount === 1
                                  ? 'orden'
                                  : 'órdenes'}
                                )
                              </span>
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-400"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {hasInventory && (
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4 text-teal-600 dark:text-teal-400" />
                    Existencias por producto en almacén
                  </CardTitle>
                  <CardDescription>
                    Comparativa de unidades disponibles por producto activo.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {productsStatsQuery.isLoading && productsQuery.isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : productsStatsQuery.isError && productsQuery.isError ? (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    <AlertCircle className="size-4 shrink-0" />
                    Información no disponible por el momento.
                  </div>
                ) : stockChartItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    Da de alta productos en el catálogo para visualizar el nivel
                    de existencias.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stockChartItems.map((product) => {
                      const widthPct =
                        product.stockOnHand <= 0
                          ? 3
                          : Math.max(
                              Math.round(
                                (product.stockOnHand / maxProductStock) * 100,
                              ),
                              6,
                            );
                      const isCritical = product.stockOnHand === 0;
                      const isLow =
                        product.stockOnHand > 0 && product.stockOnHand <= 5;
                      return (
                        <div key={product.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0 truncate">
                              <span className="font-medium">
                                {product.name}
                              </span>{' '}
                              <span className="font-mono text-xs text-muted-foreground">
                                ({product.sku})
                              </span>
                            </div>
                            <span className="shrink-0 font-mono text-xs font-semibold">
                              {product.stockOnHand.toLocaleString('es-MX')} uds.
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className={`h-full rounded-full transition-all ${
                                isCritical
                                  ? 'bg-destructive'
                                  : isLow
                                    ? 'bg-amber-500 dark:bg-amber-400'
                                    : 'bg-teal-600 dark:bg-teal-400'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        {hasPurchases && (
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="size-4 text-teal-600 dark:text-teal-400" />
                  Órdenes de compra recientes
                </CardTitle>
                <CardDescription>Últimas órdenes registradas.</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/purchases/orders">
                  Ver todas
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="flex-1">
              {ordersQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : ordersQuery.isError ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  <AlertCircle className="size-4 shrink-0" />
                  Información no disponible por el momento.
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-dashed p-5">
                  <p className="text-sm text-muted-foreground">
                    Aún no hay órdenes de compra registradas.
                  </p>
                  <Button asChild size="sm">
                    <Link to="/purchases/orders/new">
                      <Plus className="size-4" />
                      Crear primera orden
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y rounded-xl border">
                  {recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      to={`/purchases/orders/${order.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm transition hover:bg-muted/50"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">
                          {order.supplierName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.lines.length} línea(s) ·{' '}
                          {formatUtcDateTime(order.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-semibold">
                          {formatMxn(order.totalAmount)}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {hasInventory && (
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageCheck className="size-4 text-teal-600 dark:text-teal-400" />
                  Estado del catálogo de inventario
                </CardTitle>
                <CardDescription>
                  Productos registrados y disponibilidad de stock.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/inventory/products">
                  Catálogo
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="flex-1">
              {productsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : productsQuery.isError ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  <AlertCircle className="size-4 shrink-0" />
                  Información no disponible por el momento.
                </div>
              ) : recentProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No hay productos registrados todavía en el catálogo.
                </div>
              ) : (
                <div className="divide-y rounded-xl border">
                  {recentProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          SKU: {product.sku}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            product.stockOnHand > 0 ? 'secondary' : 'outline'
                          }
                        >
                          {product.stockOnHand} uds.
                        </Badge>
                        {!product.active && (
                          <Badge variant="outline">Inactivo</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-indigo-600 dark:text-indigo-400" />
                  Usuarios y permisos por sistema
                </CardTitle>
                <CardDescription>
                  Cuentas registradas recientemente y sus permisos por área.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/administration/users">
                  Administrar usuarios
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {usersQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : usersQuery.isError ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  <AlertCircle className="size-4 shrink-0" />
                  Información no disponible por el momento.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border p-3.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {user.displayName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                        <Badge
                          variant={user.active ? 'secondary' : 'outline'}
                          className="shrink-0 gap-1"
                        >
                          {user.active && (
                            <CheckCircle2 className="size-3 text-teal-600 dark:text-teal-400" />
                          )}
                          {user.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {user.assignments.map((assignment) => (
                          <Badge
                            key={`${user.id}-${assignment.system}`}
                            variant="outline"
                            className="text-[11px]"
                          >
                            {SYSTEM_LABELS[assignment.system] ??
                              assignment.system}
                            : {ROLE_LABELS[assignment.role] ?? assignment.role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
