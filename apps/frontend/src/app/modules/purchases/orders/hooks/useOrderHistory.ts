import { useQuery } from '@tanstack/react-query';

import { getPurchaseOrderHistory } from '../services/purchase-orders.service';
import { orderQueryKeys } from './order-query-keys';

export function useOrderHistory(orderId: string, enabled = true) {
  return useQuery({
    queryKey: orderQueryKeys.history(orderId),
    queryFn: () => getPurchaseOrderHistory(orderId),
    enabled: enabled && Boolean(orderId),
  });
}
