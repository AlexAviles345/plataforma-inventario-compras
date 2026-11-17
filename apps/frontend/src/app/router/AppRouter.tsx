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
                  <ModuleComingSoonPage
                    title="Productos de inventario"
                    phase={4}
                    description="Catálogo, existencias y control optimista de productos."
                  />
                </SystemTokenGuard>
              }
            />
            <Route
              path="/purchases/orders"
              element={
                <SystemTokenGuard system="PURCHASES">
                  <ModuleComingSoonPage
                    title="Órdenes de compra"
                    phase={3}
                    description="Captura maestro-detalle, transiciones e historial auditable."
                  />
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
                  <ModuleComingSoonPage
                    title="Configuración de sistemas"
                    phase={5}
                    description="Vigencia JWT y configuración operativa por sistema."
                  />
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
