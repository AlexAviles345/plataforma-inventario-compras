import {
  BASE_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  retryDelayMs,
  sanitizeError,
} from './backoff';

describe('retryDelayMs', () => {
  it('doubles from 1 s and keeps jitter between 50 % and 100 %', () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n, () => 1))).toEqual([
      1_000, 2_000, 4_000, 8_000,
    ]);
    expect(retryDelayMs(1, () => 0)).toBe(BASE_RETRY_DELAY_MS / 2);
    expect(retryDelayMs(3, () => 0.5)).toBe(3_000);
  });

  it('caps the delay at five minutes even after many attempts', () => {
    expect(retryDelayMs(50, () => 1)).toBe(MAX_RETRY_DELAY_MS);
    expect(retryDelayMs(10_000, () => 0)).toBe(MAX_RETRY_DELAY_MS / 2);
  });

  it('treats attempt 0 or less as the first attempt', () => {
    expect(retryDelayMs(0, () => 1)).toBe(1_000);
  });
});

describe('sanitizeError', () => {
  it('keeps name and message on a single line', () => {
    expect(sanitizeError(new TypeError('falló\n  en\tbroker'))).toBe(
      'TypeError: falló en broker',
    );
  });

  it('handles non-Error values and truncates long messages', () => {
    expect(sanitizeError('texto')).toBe('Error: texto');
    const long = sanitizeError(new Error('x'.repeat(2_000)));
    expect(long).toHaveLength(1_000);
    expect(long.endsWith('…')).toBe(true);
  });
});
