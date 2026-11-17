import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AccessDeniedPage } from '@shared/components/layout/AccessDeniedPage';
import { ModuleComingSoonPage } from '@shared/components/layout/ModuleComingSoonPage';
import { Skeleton } from '@shared/components/ui/skeleton';
import { ProtectedRouteGuard } from './ProtectedRouteGuard';
import { SystemTokenGuard } from './SystemTokenGuard';

const LoginPage = lazy(() =>
  import('@auth/login/page').then((module) => ({ default: module.LoginPage })),
);
const ModulesLayout = lazy(() =>
  import('@modules/layout').then((module) => ({
    default: module.ModulesLayout,
  })),
);
const DashboardPage = lazy(() =>
  import('@modules/dashboard/page').then((module) => ({
    default: module.DashboardPage,
  })),
);
const OrdersPage = lazy(() =>
  import('@modules/purchases/orders/page').then((module) => ({
    default: module.OrdersPage,
  })),
);
const OrderFormPage = lazy(() =>
  import('@modules/purchases/orders/new/page').then((module) => ({
    default: module.OrderFormPage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('@modules/purchases/orders/detail/page').then((module) => ({
    default: module.OrderDetailPage,
  })),
);
const ProductsPage = lazy(() =>
  import('@modules/inventory/products/page').then((module) => ({
    default: module.ProductsPage,
  })),
);
const SystemsPage = lazy(() =>
  import('@modules/administration/systems/page').then((module) => ({
    default: module.SystemsPage,
  })),
);

function RouteLoader() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-8" aria-label="Cargando">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRouteGuard />}>
          <Route element={<ModulesLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/forbidden" element={<AccessDeniedPage />} />
            <Route
              path="/inventory/products"
              element={
                <SystemTokenGuard system="INVENTORY">
                  <ProductsPage />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/purchases/orders"
              element={
                <SystemTokenGuard system="PURCHASES">
                  <OrdersPage />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/purchases/orders/new"
              element={
                <SystemTokenGuard system="PURCHASES">
                  <OrderFormPage />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/purchases/orders/:orderId"
              element={
                <SystemTokenGuard system="PURCHASES">
                  <OrderDetailPage />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/purchases/orders/:orderId/edit"
              element={
                <SystemTokenGuard system="PURCHASES">
                  <OrderFormPage />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/administration/users"
              element={
                <SystemTokenGuard roles={['ADMIN']}>
                  <ModuleComingSoonPage
                    title="Administración de usuarios"
                    phase={5}
                    description="Usuarios, estados y asignaciones por sistema."
                  />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/administration/systems"
              element={
                <SystemTokenGuard roles={['ADMIN']}>
                  <SystemsPage />
                </SystemTokenGuard>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
