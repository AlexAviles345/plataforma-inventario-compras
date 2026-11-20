import { Boxes, Gauge, ShoppingCart, Users } from 'lucide-react';

import { Badge } from '@shared/components/ui/badge';
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

const INVENTORY_ROLE_HINTS: Record<InventoryAssignmentRole, string> = {
  NONE: 'Sin token ni acceso al microservicio de inventario.',
  INVENTORY_MANAGER: 'Opera el catálogo de productos y ajustes de stock.',
  ADMIN: 'Control total en inventario y administración de usuarios.',
};

const PURCHASES_ROLE_HINTS: Record<PurchasesAssignmentRole, string> = {
  NONE: 'Sin token ni acceso al microservicio de compras.',
  PURCHASES_AGENT: 'Crea y gestiona únicamente sus propias órdenes de compra.',
  ADMIN: 'Supervisa órdenes de todos los usuarios y administra cuentas.',
};

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
  const hasInventory = inventoryRole !== 'NONE';
  const hasPurchases = purchasesRole !== 'NONE';
  const isAdmin = inventoryRole === 'ADMIN' || purchasesRole === 'ADMIN';
  const hasAnySystem = hasInventory || hasPurchases;

  const sidebarPreview = [
    hasAnySystem && { label: 'Resumen', icon: Gauge },
    hasInventory && { label: 'Productos', icon: Boxes },
    hasPurchases && { label: 'Órdenes de compra', icon: ShoppingCart },
    isAdmin && { label: 'Usuarios', icon: Users },
  ].filter(Boolean);

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
          <p className="text-[11px] leading-4 text-muted-foreground">
            {INVENTORY_ROLE_HINTS[inventoryRole]}
          </p>
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
          <p className="text-[11px] leading-4 text-muted-foreground">
            {PURCHASES_ROLE_HINTS[purchasesRole]}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed bg-muted/30 px-3.5 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          Secciones que verá en la barra lateral dinámica:
        </p>
        {sidebarPreview.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sidebarPreview.map((section) => {
              if (!section) return null;
              const Icon = section.icon;
              return (
                <Badge
                  key={section.label}
                  variant="secondary"
                  className="gap-1.5 px-2 py-0.5 text-xs font-medium"
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {section.label}
                </Badge>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Ninguna — selecciona al menos un sistema para habilitar el acceso.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
