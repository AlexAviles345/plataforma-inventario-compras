import { useQuery } from '@tanstack/react-query';

import { getPurchaseOrder } from '../services/purchase-orders.service';
import { orderQueryKeys } from './order-query-keys';

export function useOrderDetail(orderId?: string) {
  return useQuery({
    queryKey: orderQueryKeys.detail(orderId ?? ''),
    queryFn: () => getPurchaseOrder(orderId ?? ''),
    enabled: Boolean(orderId),
    refetchOnMount: 'always',
  });
}
