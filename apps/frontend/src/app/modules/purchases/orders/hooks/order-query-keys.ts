import type { OrdersListFilters } from '../types/purchase-orders.types';

export const orderQueryKeys = {
  all: ['purchase-orders'] as const,
  lists: () => [...orderQueryKeys.all, 'list'] as const,
  list: (filters: OrdersListFilters) =>
    [...orderQueryKeys.lists(), filters] as const,
  details: () => [...orderQueryKeys.all, 'detail'] as const,
  detail: (orderId: string) => [...orderQueryKeys.details(), orderId] as const,
  history: (orderId: string) =>
    [...orderQueryKeys.detail(orderId), 'history'] as const,
};
