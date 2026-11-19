import { ArrowUpRight, Boxes, Settings2, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@shared/components/ui/badge';
import {
  selectIsAdmin,
  useAuthSessionStore,
} from '@shared/stores/auth-session.store';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';

export function QuickModuleAccessGrid() {
  const sessions = useAuthSessionStore((state) => state.sessions);
  const isAdmin = useAuthSessionStore(selectIsAdmin);
  const hasInventory = Boolean(
    sessions.INVENTORY && !isAccessTokenExpired(sessions.INVENTORY.claims),
  );
  const hasPurchases = Boolean(
    sessions.PURCHASES && !isAccessTokenExpired(sessions.PURCHASES.claims),
  );
  const modules = [
    hasInventory && {
      title: 'Inventario',
      description: 'Consulta el catálogo y controla existencias.',
      path: '/inventory/products',
      icon: Boxes,
      badge: 'INVENTORY',
    },
    hasPurchases && {
      title: 'Compras',
      description: 'Gestiona órdenes y su historial auditable.',
      path: '/purchases/orders',
      icon: ShoppingCart,
      badge: 'PURCHASES',
    },
    isAdmin && {
      title: 'Administración',
      description: 'Usuarios, asignaciones y sistemas.',
      path: '/administration/users',
      icon: Settings2,
      badge: 'ADMIN',
    },
  ].filter(Boolean);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => {
        if (!module) return null;
        const Icon = module.icon;
        return (
          <Link
            key={module.path}
            to={module.path}
            className="group rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md dark:hover:border-teal-800"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-foreground" />
            </div>
            <h2 className="mt-5 font-semibold">{module.title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {module.description}
            </p>
            <Badge variant="outline" className="mt-4">
              {module.badge}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
