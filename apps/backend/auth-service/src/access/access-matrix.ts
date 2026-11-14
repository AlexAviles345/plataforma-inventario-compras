/** Sistemas y roles del contrato común (docs/standards/guidelines.md). */
export const SYSTEM_CODES = ['INVENTORY', 'PURCHASES'] as const;
export type SystemCode = (typeof SYSTEM_CODES)[number];

export const ROLES = ['ADMIN', 'INVENTORY_MANAGER', 'PURCHASES_AGENT'] as const;
export type Role = (typeof ROLES)[number];

/** Roles asignables por sistema; la base lo refuerza con ck_user_systems_role. */
export const ROLES_BY_SYSTEM: Record<SystemCode, readonly Role[]> = {
  INVENTORY: ['ADMIN', 'INVENTORY_MANAGER'],
  PURCHASES: ['ADMIN', 'PURCHASES_AGENT'],
};
