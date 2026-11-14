import type { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL devuelve `bigint` como string. Las versiones y contadores de Auth
 * caben holgadamente en un entero seguro de JavaScript.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
