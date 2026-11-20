import type {
  InventoryAssignmentRole,
  PurchasesAssignmentRole,
} from '../schemas/user-form.schema';
import type {
  AdminUser,
  UserSystemAssignment,
} from '../types/users-admin.types';

export function toAssignments(
  inventoryRole: InventoryAssignmentRole,
  purchasesRole: PurchasesAssignmentRole,
): UserSystemAssignment[] {
  return [
    ...(inventoryRole === 'NONE'
      ? []
      : [{ system: 'INVENTORY' as const, role: inventoryRole }]),
    ...(purchasesRole === 'NONE'
      ? []
      : [{ system: 'PURCHASES' as const, role: purchasesRole }]),
  ];
}

export function fromAssignments(user?: AdminUser): {
  inventoryRole: InventoryAssignmentRole;
  purchasesRole: PurchasesAssignmentRole;
} {
  const inventory = user?.assignments.find(
    (assignment) => assignment.system === 'INVENTORY',
  );
  const purchases = user?.assignments.find(
    (assignment) => assignment.system === 'PURCHASES',
  );

  return {
    inventoryRole:
      inventory?.role === 'ADMIN' || inventory?.role === 'INVENTORY_MANAGER'
        ? inventory.role
        : 'NONE',
    purchasesRole:
      purchases?.role === 'ADMIN' || purchases?.role === 'PURCHASES_AGENT'
        ? purchases.role
        : 'NONE',
  };
}
