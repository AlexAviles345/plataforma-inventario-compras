import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileSpreadsheet,
  PackageCheck,
  Plus,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { listAdminUsers } from '@modules/administration/users/services/users-admin.service';
import { userQueryKeys } from '@modules/administration/users/hooks/user-query-keys';
import { listProducts } from '@modules/inventory/products/services/products.service';
import { productQueryKeys } from '@modules/inventory/products/hooks/product-query-keys';
import { listPurchaseOrders } from '@modules/purchases/orders/services/purchase-orders.service';
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
import { formatMxn, sumMoney } from '@shared/utils/decimal-money.util';

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
  const totalOrders = ordersQuery.data?.meta.total ?? 0;
  const draftOrdersCount = recentOrders.filter(
    (order) => order.status === 'DRAFT',
  ).length;
  const submittedOrdersCount = recentOrders.filter(
    (order) => order.status === 'SUBMITTED',
  ).length;
  const activeRecentOrdersAmount = formatMxn(
    sumMoney(
      recentOrders
        .filter((order) => order.status !== 'CANCELLED')
        .map((order) => order.totalAmount),
    ),
  );

  const recentProducts = productsQuery.data?.products ?? [];
  const totalProducts = productsQuery.data?.meta.total ?? 0;
  const totalUnitsInSample = recentProducts.reduce(
    (acc, item) => acc + item.stockOnHand,
    0,
  );
  const outOfStockCount = recentProducts.filter(
    (item) => item.stockOnHand === 0,
  ).length;

  const recentUsers = usersQuery.data?.users ?? [];
  const totalUsers = usersQuery.data?.meta.total ?? 0;
  const activeUsersInSample = recentUsers.filter((user) => user.active).length;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Indicadores operativos</h2>
            <p className="text-sm text-muted-foreground">
              Métricas en tiempo real consultadas según los permisos de tu
              sesión.
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {hasPurchases && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="font-medium">
                    Órdenes de compra
                  </CardDescription>
                  <ShoppingCart className="size-4 text-teal-600 dark:text-teal-400" />
                </CardHeader>
                <CardContent>
                  {ordersQuery.isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : ordersQuery.isError ? (
                    <p className="text-sm text-muted-foreground">
                      Sin conexión a Compras
                    </p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold">{totalOrders}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {submittedOrdersCount} enviadas · {draftOrdersCount} en
                        borrador (recientes)
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardDescription className="font-medium">
                    Importe reciente (activas)
                  </CardDescription>
                  <Wallet className="size-4 text-blue-600 dark:text-blue-400" />
                </CardHeader>
                <CardContent>
                  {ordersQuery.isLoading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : ordersQuery.isError ? (
                    <p className="text-sm text-muted-foreground">
                      No disponible
                    </p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold">
                        {activeRecentOrdersAmount}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Suma de las últimas órdenes no canceladas
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {hasInventory && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="font-medium">
                  Catálogo de productos
                </CardDescription>
                <Boxes className="size-4 text-teal-600 dark:text-teal-400" />
              </CardHeader>
              <CardContent>
                {productsQuery.isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : productsQuery.isError ? (
                  <>
                    <p className="text-base font-semibold text-muted-foreground">
                      Servicio en espera
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      El catálogo responderá al activar inventory-service
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">{totalProducts}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {totalUnitsInSample} uds. en muestra · {outOfStockCount}{' '}
                      sin stock
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="font-medium">
                  Usuarios y accesos
                </CardDescription>
                <Users className="size-4 text-indigo-600 dark:text-indigo-400" />
              </CardHeader>
              <CardContent>
                {usersQuery.isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : usersQuery.isError ? (
                  <p className="text-sm text-muted-foreground">No disponible</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold">{totalUsers}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeUsersInSample} de {recentUsers.length} activos en
                      vista reciente
                    </p>
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
