import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const segmentLabels: Record<string, string> = {
  dashboard: 'Resumen',
  inventory: 'Inventario',
  products: 'Productos',
  purchases: 'Compras',
  orders: 'Órdenes',
  new: 'Nueva orden',
  edit: 'Editar',
  administration: 'Administración',
  users: 'Usuarios',
  systems: 'Sistemas',
};

export function BreadcrumbNav() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Migas de pan" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        {segments.map((segment, index) => {
          const path = `/${segments.slice(0, index + 1).join('/')}`;
          const current = index === segments.length - 1;

          return (
            <Fragment key={path}>
              {index > 0 && (
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <li className="min-w-0">
                {current ? (
                  <span
                    className="block truncate font-medium"
                    aria-current="page"
                  >
                    {segmentLabels[segment] ?? segment}
                  </span>
                ) : (
                  <Link
                    to={path}
                    className="block truncate text-muted-foreground hover:text-foreground"
                  >
                    {segmentLabels[segment] ?? segment}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
