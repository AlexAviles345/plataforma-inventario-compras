import Decimal from 'decimal.js';

export const MONEY_PRECISION = 18;
export const MONEY_SCALE = 2;
export const MONEY_INTEGER_DIGITS = MONEY_PRECISION - MONEY_SCALE;

const decimalPattern = /^\d+(?:\.\d+)?$/;
const maximumMoney = new Decimal('9999999999999999.99');

export type ExactMoney = string | Decimal;

export type MoneyValidationCode =
  | 'INVALID_DECIMAL_FORMAT'
  | 'INVALID_DECIMAL_SCALE'
  | 'DECIMAL_OVERFLOW'
  | 'INVALID_MONEY_VALUE';

export class MoneyValidationError extends Error {
  constructor(
    public readonly code: MoneyValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'MoneyValidationError';
  }
}

function assertMoneyRange(value: Decimal): Decimal {
  if (!value.isFinite() || value.isNegative()) {
    throw new MoneyValidationError(
      'INVALID_MONEY_VALUE',
      'El importe debe ser un decimal finito mayor o igual a cero',
    );
  }

  if (value.decimalPlaces() > MONEY_SCALE) {
    throw new MoneyValidationError(
      'INVALID_DECIMAL_SCALE',
      `El importe admite como máximo ${MONEY_SCALE} decimales`,
    );
  }

  if (value.greaterThan(maximumMoney)) {
    throw new MoneyValidationError(
      'DECIMAL_OVERFLOW',
      `El importe excede numeric(${MONEY_PRECISION}, ${MONEY_SCALE})`,
    );
  }

  return value;
}

export function parseMoney(value: string): Decimal {
  const normalized = value.trim();

  if (!decimalPattern.test(normalized)) {
    throw new MoneyValidationError(
      'INVALID_DECIMAL_FORMAT',
      'El importe debe usar dígitos y un punto decimal opcional',
    );
  }

  const [, fraction = ''] = normalized.split('.');
  if (fraction.length > MONEY_SCALE) {
    throw new MoneyValidationError(
      'INVALID_DECIMAL_SCALE',
      `El importe admite como máximo ${MONEY_SCALE} decimales`,
    );
  }

  return assertMoneyRange(new Decimal(normalized));
}

export function toDecimalMoney(value: ExactMoney): Decimal {
  return value instanceof Decimal ? assertMoneyRange(value) : parseMoney(value);
}

export function isValidMoney(value: string): boolean {
  try {
    parseMoney(value);
    return true;
  } catch {
    return false;
  }
}

export function requirePositiveMoney(value: ExactMoney): Decimal {
  const amount = toDecimalMoney(value);
  if (amount.isZero()) {
    throw new MoneyValidationError(
      'INVALID_MONEY_VALUE',
      'El importe debe ser mayor que cero',
    );
  }
  return amount;
}

export function multiplyMoney(
  quantity: number,
  unitPrice: ExactMoney,
): Decimal {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError('La cantidad debe ser un entero positivo');
  }

  return assertMoneyRange(requirePositiveMoney(unitPrice).times(quantity));
}

export function sumMoney(values: readonly ExactMoney[]): Decimal {
  return assertMoneyRange(
    values.reduce<Decimal>(
      (total, value) => total.plus(toDecimalMoney(value)),
      new Decimal(0),
    ),
  );
}

export function toMoneyString(value: ExactMoney): string {
  return toDecimalMoney(value).toFixed(MONEY_SCALE);
}

export function formatMxn(value: ExactMoney): string {
  const [integer, fraction] = toMoneyString(value).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}.${fraction} MXN`;
}
