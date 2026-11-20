import { describe, expect, it } from 'vitest';

import {
  MoneyValidationError,
  formatMxn,
  multiplyMoney,
  parseMoney,
  sumMoney,
  toMoneyString,
} from './decimal-money.util';

describe('decimal-money.util', () => {
  it('calcula y suma importes sin usar punto flotante binario', () => {
    const firstLine = multiplyMoney(3, '0.10');
    const secondLine = multiplyMoney(2, '10.25');

    expect(toMoneyString(firstLine)).toBe('0.30');
    expect(toMoneyString(sumMoney([firstLine, secondLine]))).toBe('20.80');
  });

  it('formatea moneda mexicana con dos decimales', () => {
    expect(formatMxn('1250000.5')).toBe('$1,250,000.50 MXN');
  });

  it('rechaza una escala mayor a dos decimales', () => {
    expect(() => parseMoney('10.001')).toThrowError(
      expect.objectContaining<Partial<MoneyValidationError>>({
        code: 'INVALID_DECIMAL_SCALE',
      }),
    );
  });

  it('rechaza cantidades no enteras o no positivas', () => {
    expect(() => multiplyMoney(0, '10.00')).toThrow(RangeError);
    expect(() => multiplyMoney(1.5, '10.00')).toThrow(RangeError);
  });
});
