import { Boxes, ShoppingCart } from 'lucide-react';

import { Label } from '@shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/components/ui/select';

import type {
  InventoryAssignmentRole,
  PurchasesAssignmentRole,
} from '../schemas/user-form.schema';

export function UserSystemAssignmentsField({
  inventoryRole,
  purchasesRole,
  onInventoryRoleChange,
  onPurchasesRoleChange,
  error,
  disabled,
}: {
  inventoryRole: InventoryAssignmentRole;
  purchasesRole: PurchasesAssignmentRole;
  onInventoryRoleChange: (role: InventoryAssignmentRole) => void;
  onPurchasesRoleChange: (role: PurchasesAssignmentRole) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-3">
      <div>
        <legend className="font-medium">Asignaciones por sistema</legend>
        <p className="text-xs text-muted-foreground">
          Cada usuario puede tener como máximo un rol por sistema.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border p-4">
          <Label className="flex items-center gap-2">
            <Boxes className="size-4 text-teal-600" /> INVENTORY
          </Label>
          <Select
            value={inventoryRole}
            onValueChange={(value) =>
              onInventoryRoleChange(value as InventoryAssignmentRole)
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-full" aria-invalid={Boolean(error)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Sin acceso</SelectItem>
              <SelectItem value="INVENTORY_MANAGER">
                Gestor de inventario
              </SelectItem>
              <SelectItem value="ADMIN">Administrador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 rounded-xl border p-4">
          <Label className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-blue-600" /> PURCHASES
          </Label>
          <Select
            value={purchasesRole}
            onValueChange={(value) =>
              onPurchasesRoleChange(value as PurchasesAssignmentRole)
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-full" aria-invalid={Boolean(error)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Sin acceso</SelectItem>
              <SelectItem value="PURCHASES_AGENT">Agente de compras</SelectItem>
              <SelectItem value="ADMIN">Administrador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
