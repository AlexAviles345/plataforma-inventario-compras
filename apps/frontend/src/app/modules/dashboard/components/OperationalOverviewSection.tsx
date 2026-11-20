import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
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
import {
  getPurchaseOrdersStats,
  listPurchaseOrders,
} from '@modules/purchases/orders/services/purchase-orders.service';
import { orderQueryKeys } from '@modules/purchases/orders/hooks/order-query-keys';
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
  ADMIN: 'Admin',
  INVENTORY_MANAGER: 'Gestor',
  PURCHASES_AGENT: 'Agente',
};

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

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Estadísticas generales por servicio
            </h2>
            <p className="text-sm text-muted-foreground">
              Métricas agregadas consultadas directamente de cada microservicio
              habilitado para tu rol.
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
                  <Badge variant="outline" className="w-fit text-[10px]">
                    PURCHASES SERVICE
                  </Badge>
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
                  <p className="text-sm text-muted-foreground">
                    Estadísticas de compras no disponibles en este momento.
                  </p>
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
                  <Badge variant="outline" className="w-fit text-[10px]">
                    INVENTORY SERVICE
                  </Badge>
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
                  <div className="space-y-2 rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Servicio de inventario en espera
                    </p>
                    <p>
                      Conectado a <code>GET /api/inventory/products/stats</code>
                      . Se mostrará automáticamente al levantar el dominio en{' '}
                      <code>inventory-service</code>.
                    </p>
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
                  <Badge variant="outline" className="w-fit text-[10px]">
                    AUTH SERVICE
                  </Badge>
                  <CardTitle className="text-base">
                    Identidades y RBAC
                  </CardTitle>
                  <CardDescription>
                    Usuarios activos y cobertura por sistema
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
                  <p className="text-sm text-muted-foreground">
                    Estadísticas de usuarios no disponibles.
                  </p>
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
                          Admins
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

      <section className="grid gap-6 lg:grid-cols-2">
        {hasPurchases && (
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="size-4 text-teal-600 dark:text-teal-400" />
                  Órdenes de compra recientes
                </CardTitle>
                <CardDescription>
                  Últimos movimientos registrados en el dominio de compras.
                </CardDescription>
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
                  No fue posible cargar las órdenes recientes en este momento.
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-dashed p-5">
                  <p className="text-sm text-muted-foreground">
                    Aún no hay órdenes de compra registradas para tu sesión.
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
                  El microservicio de inventario no devolvió productos o se
                  encuentra en espera de implementación de endpoints.
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
                  Vista rápida de las cuentas registradas en Auth y sus roles en
                  cada microservicio.
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
                  No fue posible consultar el listado reciente de usuarios.
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
                            {assignment.system}:{' '}
                            {ROLE_LABELS[assignment.role] ?? assignment.role}
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
