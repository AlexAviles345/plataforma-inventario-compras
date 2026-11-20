import { z } from 'zod';

import { requirePositiveMoney } from '@shared/utils/decimal-money.util';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const orderLineSchema = z.object({
  productId: z
    .string()
    .trim()
    .regex(UUID_PATTERN, 'Selecciona un producto válido'),
  quantity: z
    .number({ error: 'Ingresa una cantidad' })
    .int('La cantidad debe ser un entero')
    .min(1, 'La cantidad mínima es 1')
    .max(1_000_000_000, 'La cantidad excede el máximo permitido'),
  unitPrice: z
    .string()
    .trim()
    .min(1, 'Ingresa el precio unitario')
    .superRefine((value, context) => {
      try {
        requirePositiveMoney(value);
      } catch (error) {
        context.addIssue({
          code: 'custom',
          message:
            error instanceof Error ? error.message : 'Precio unitario inválido',
        });
      }
    }),
});

export const orderFormSchema = z
  .object({
    supplierName: z
      .string()
      .trim()
      .min(1, 'Ingresa el nombre del proveedor')
      .max(200, 'El proveedor no puede exceder 200 caracteres'),
    lines: z
      .array(orderLineSchema)
      .min(1, 'Agrega al menos una línea')
      .max(100, 'La orden no puede exceder 100 líneas'),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.lines.forEach((line, index) => {
      const productId = line.productId.toLowerCase();
      if (seen.has(productId)) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'productId'],
          message: 'El producto ya está incluido en otra línea',
        });
      }
      seen.add(productId);
    });
  });

export type OrderFormValues = z.infer<typeof orderFormSchema>;
