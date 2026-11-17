import { describe, expect, it } from 'vitest';

import { orderFormSchema } from './order-form.schema';

const PRODUCT_A = '00000000-0000-4000-8000-000000000001';
const PRODUCT_B = '00000000-0000-4000-8000-000000000002';

describe('orderFormSchema', () => {
  it('acepta una orden válida con importes exactos', () => {
    const result = orderFormSchema.safeParse({
      supplierName: 'Proveedor principal',
      lines: [
        { productId: PRODUCT_A, quantity: 2, unitPrice: '1250.50' },
        { productId: PRODUCT_B, quantity: 1, unitPrice: '0.10' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rechaza UUID repetidos sin distinguir mayúsculas', () => {
    const result = orderFormSchema.safeParse({
      supplierName: 'Proveedor',
      lines: [
        { productId: PRODUCT_A, quantity: 1, unitPrice: '1.00' },
        {
          productId: PRODUCT_A.toUpperCase(),
          quantity: 1,
          unitPrice: '2.00',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['lines', 1, 'productId'] }),
      ]),
    );
  });

  it('rechaza más de 100 líneas y precios con escala inválida', () => {
    const line = { productId: PRODUCT_A, quantity: 1, unitPrice: '1.001' };
    const result = orderFormSchema.safeParse({
      supplierName: 'Proveedor',
      lines: Array.from({ length: 101 }, (_, index) => ({
        ...line,
        productId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      })),
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path[0] === 'lines'),
    ).toBe(true);
  });
});
