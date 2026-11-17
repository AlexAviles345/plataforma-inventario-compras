import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  cancelPurchaseOrder,
  submitPurchaseOrder,
} from '../services/purchase-orders.service';
import type { PurchaseOrder } from '../types/purchase-orders.types';
import { orderQueryKeys } from './order-query-keys';

interface SubmitVariables {
  expectedVersion: number;
  idempotencyKey: string;
}

interface CancelVariables extends SubmitVariables {
  reason?: string;
}

export function useOrderMutations(orderId: string) {
  const queryClient = useQueryClient();

  const applyOrder = async (order: PurchaseOrder, message: string) => {
    queryClient.setQueryData(orderQueryKeys.detail(orderId), order);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() }),
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.history(orderId),
      }),
    ]);
    toast.success(message);
  };

  const submitMutation = useMutation({
    mutationFn: ({ expectedVersion, idempotencyKey }: SubmitVariables) =>
      submitPurchaseOrder(orderId, { expectedVersion }, idempotencyKey),
    onSuccess: (order) => applyOrder(order, 'Orden enviada correctamente'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      expectedVersion,
      idempotencyKey,
      reason,
    }: CancelVariables) =>
      cancelPurchaseOrder(
        orderId,
        { expectedVersion, ...(reason ? { reason } : {}) },
        idempotencyKey,
      ),
    onSuccess: (order) => applyOrder(order, 'Orden cancelada correctamente'),
  });

  return { submitMutation, cancelMutation };
}
