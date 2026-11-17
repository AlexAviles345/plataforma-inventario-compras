import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { GatewayApiError } from '@shared/services/gateway-api-error';

import {
  productCreateSchema,
  type ProductCreateFormValues,
} from '../schemas/product-form.schemas';
import { createProduct } from '../services/products.service';
import { productQueryKeys } from './product-query-keys';

export function useCreateProduct(onCreated: () => void) {
  const queryClient = useQueryClient();
  const form = useForm<ProductCreateFormValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: { sku: '', name: '', stockOnHand: 0 },
  });
  const mutation = useMutation({
    mutationFn: (values: ProductCreateFormValues) =>
      createProduct({
        sku: values.sku.trim().toUpperCase(),
        name: values.name.trim(),
        unit: 'UNIT',
        stockOnHand: values.stockOnHand,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productQueryKeys.all });
      toast.success('Producto creado correctamente');
      form.reset();
      onCreated();
    },
    onError: (error) => {
      if (error instanceof GatewayApiError) {
        error.details?.forEach((detail) => {
          if (detail.field) {
            form.setError(detail.field as FieldPath<ProductCreateFormValues>, {
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
