import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { GatewayApiError } from '@shared/services/gateway-api-error';

import {
  createProductEditSchema,
  type ProductEditFormValues,
} from '../schemas/product-form.schemas';
import { updateProduct } from '../services/products.service';
import type { InventoryProduct } from '../types/products.types';
import { productQueryKeys } from './product-query-keys';

export function useUpdateProduct(
  product: InventoryProduct,
  onUpdated: () => void,
) {
  const queryClient = useQueryClient();
  const form = useForm<ProductEditFormValues>({
    resolver: zodResolver(createProductEditSchema(product.stockOnHand)),
    defaultValues: {
      sku: product.sku,
      name: product.name,
      stockOnHand: product.stockOnHand,
      active: product.active,
      reason: '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: ProductEditFormValues) =>
      updateProduct(product.id, {
        expectedVersion: product.version,
        sku: values.sku.trim().toUpperCase(),
        name: values.name.trim(),
        stockOnHand: values.stockOnHand,
        active: values.active,
        ...(values.reason ? { reason: values.reason.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productQueryKeys.all });
      toast.success('Producto actualizado correctamente');
      onUpdated();
    },
    onError: (error) => {
      if (error instanceof GatewayApiError) {
        if (error.code === 'VERSION_CONFLICT') {
          void queryClient.invalidateQueries({
            queryKey: productQueryKeys.all,
          });
        }
        error.details?.forEach((detail) => {
          if (detail.field) {
            form.setError(detail.field as FieldPath<ProductEditFormValues>, {
              type: 'server',
              message: detail.message,
            });
          }
        });
      }
    },
  });

  return {
    form,
    mutation,
    submit: form.handleSubmit((v) => mutation.mutate(v)),
  };
}
