import { z } from 'zod';

const skuSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa el SKU')
  .max(64, 'El SKU no puede exceder 64 caracteres')
  .regex(
    /^[A-Za-z0-9._-]+$/,
    'Usa únicamente letras, números, punto, guion o guion bajo',
  );

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre del producto')
  .max(200, 'El nombre no puede exceder 200 caracteres');

const stockSchema = z
  .number({ error: 'Ingresa las existencias' })
  .int('Las existencias deben ser un entero')
  .min(0, 'Las existencias no pueden ser negativas')
  .max(Number.MAX_SAFE_INTEGER, 'Las existencias exceden el máximo permitido');

export const productCreateSchema = z.object({
  sku: skuSchema,
  name: nameSchema,
  stockOnHand: stockSchema,
});

export function createProductEditSchema(originalStock: number) {
  return z
    .object({
      sku: skuSchema,
      name: nameSchema,
      stockOnHand: stockSchema,
      active: z.boolean(),
      reason: z
        .string()
        .trim()
        .max(500, 'El motivo no puede exceder 500 caracteres'),
    })
    .superRefine((value, context) => {
      if (value.stockOnHand !== originalStock && !value.reason) {
        context.addIssue({
          code: 'custom',
          path: ['reason'],
          message: 'Explica el motivo del ajuste de existencias',
        });
      }
    });
}

export type ProductCreateFormValues = z.infer<typeof productCreateSchema>;
export type ProductEditFormValues = z.infer<
  ReturnType<typeof createProductEditSchema>
>;
