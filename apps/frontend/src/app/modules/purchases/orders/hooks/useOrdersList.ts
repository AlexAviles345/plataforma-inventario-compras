import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPurchaseOrders } from '../services/purchase-orders.service';
import type { OrdersListFilters } from '../types/purchase-orders.types';
import { orderQueryKeys } from './order-query-keys';

export function useOrdersList(filters: OrdersListFilters) {
  return useQuery({
    queryKey: orderQueryKeys.list(filters),
    queryFn: () => listPurchaseOrders(filters),
    placeholderData: keepPreviousData,
  });
}
