import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { GatewayApiError } from '@shared/services/gateway-api-error';
import { useIdempotencyKey } from '@shared/hooks/useIdempotencyKey';
import { toMoneyString } from '@shared/utils/decimal-money.util';

import {
  orderFormSchema,
  type OrderFormValues,
} from '../schemas/order-form.schema';
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from '../services/purchase-orders.service';
import type { PurchaseOrder } from '../types/purchase-orders.types';
import {
  clearOrderDraft,
  loadOrderDraft,
  saveOrderDraft,
} from './orderDraftStorage';
import { orderQueryKeys } from './order-query-keys';

interface UseOrderFormOptions {
  order?: PurchaseOrder;
  onSaved: (order: PurchaseOrder) => void;
}

const emptyLine: OrderFormValues['lines'][number] = {
  productId: '',
  quantity: 1,
  unitPrice: '',
};

function valuesFromOrder(order: PurchaseOrder): OrderFormValues {
  return {
    supplierName: order.supplierName,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  };
}

export function useOrderForm({ order, onSaved }: UseOrderFormOptions) {
  const queryClient = useQueryClient();
  const draft = order ? undefined : loadOrderDraft();
  const idempotency = useIdempotencyKey(draft?.idempotencyKey);
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: order
      ? valuesFromOrder(order)
      : (draft?.values ?? { supplierName: '', lines: [emptyLine] }),
  });
  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    if (order) return;
    const timeout = window.setTimeout(() => {
      saveOrderDraft({
        values: watchedValues as OrderFormValues,
        idempotencyKey: idempotency.key,
        savedAt: new Date().toISOString(),
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [idempotency.key, order, watchedValues]);

  const mutation = useMutation({
    mutationFn: async (values: OrderFormValues) => {
      const input = {
        supplierName: values.supplierName.trim(),
        lines: values.lines.map((line) => ({
          productId: line.productId.trim(),
          quantity: line.quantity,
          unitPrice: toMoneyString(line.unitPrice),
        })),
      };

      return order
        ? updatePurchaseOrder(order.id, {
            ...input,
            expectedVersion: order.version,
          })
        : createPurchaseOrder(input, idempotency.key);
    },
    onSuccess: async (savedOrder) => {
      clearOrderDraft();
      idempotency.rotate();
      await queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
      toast.success(
        order
          ? 'Orden actualizada correctamente'
          : 'Orden creada correctamente',
      );
      onSaved(savedOrder);
    },
    onError: (error) => {
      if (error instanceof GatewayApiError) {
        error.details?.forEach((detail) => {
          if (detail.field) {
            form.setError(detail.field as FieldPath<OrderFormValues>, {
              type: 'server',
              message: detail.message,
            });
          }
        });
        if (error.code === 'IDEMPOTENCY_CONFLICT') idempotency.rotate();
      }
    },
  });

  return {
    form,
    mutation,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
    restoredDraft: Boolean(draft),
  };
}
