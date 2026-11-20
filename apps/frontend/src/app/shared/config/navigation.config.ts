import {
  Boxes,
  Gauge,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { SystemCode, UserRole } from '@shared/types/auth-session.types';

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  system?: SystemCode;
  roles?: UserRole[];
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: 'Resumen', path: '/dashboard', icon: Gauge },
  {
    label: 'Productos',
    path: '/inventory/products',
    icon: Boxes,
    system: 'INVENTORY',
  },
  {
    label: 'Órdenes de compra',
    path: '/purchases/orders',
    icon: ShoppingCart,
    system: 'PURCHASES',
  },
  {
    label: 'Usuarios',
    path: '/administration/users',
    icon: Users,
    roles: ['ADMIN'],
  },
];
