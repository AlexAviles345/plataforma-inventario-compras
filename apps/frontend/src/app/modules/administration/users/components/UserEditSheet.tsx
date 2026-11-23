import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  LoaderCircle,
  Save,
  UserRoundPen,
} from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@shared/components/ui/sheet';
import { GatewayApiError } from '@shared/services/gateway-api-error';

import { useUpdateUser } from '../hooks/useUpdateUser';
import type { AdminUser } from '../types/users-admin.types';
import { UserSystemAssignmentsField } from './UserSystemAssignmentsField';

interface UserEditSheetProps {
  user?: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function UserEditForm({
  user,
  close,
}: {
  user?: AdminUser;
  close: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const { form, mutation, submit } = useUpdateUser(user, close);
  const disabled = mutation.isPending;
  const active = useWatch({ control: form.control, name: 'active' });
  const inventoryRole = useWatch({
    control: form.control,
    name: 'inventoryRole',
  });
  const purchasesRole = useWatch({
    control: form.control,
    name: 'purchasesRole',
  });
  const hasAdminRole = inventoryRole === 'ADMIN' || purchasesRole === 'ADMIN';
  const versionConflict =
    mutation.error instanceof GatewayApiError &&
    mutation.error.code === 'VERSION_CONFLICT';

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-5 overflow-y-auto px-4">
        <input type="hidden" {...form.register('userId')} />
        <input
          type="hidden"
          {...form.register('expectedVersion', { valueAsNumber: true })}
        />

        <div className="space-y-2">
          <Label htmlFor="editUserEmail">Correo</Label>
          <Input
            id="editUserEmail"
            type="email"
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="editUserDisplayName">Nombre visible</Label>
          <Input
            id="editUserDisplayName"
            maxLength={200}
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.displayName)}
            {...form.register('displayName')}
          />
          {form.formState.errors.displayName && (
            <p className="text-sm text-destructive">
              {form.formState.errors.displayName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="editUserPassword">
            Restablecer contraseña (opcional)
          </Label>
          <div className="relative">
            <Input
              id="editUserPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Dejar en blanco para conservar la actual"
              maxLength={128}
              disabled={disabled}
              className="pr-10"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
              aria-label={
                showPassword ? 'Ocultar contraseña' : 'Ver contraseña'
              }
              disabled={disabled}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {form.formState.errors.password ? (
            <p className="text-sm text-destructive">
              {form.formState.errors.password.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Si ingresas una nueva contraseña (mínimo 12 caracteres), se
              actualizará y se cerrarán las sesiones activas del usuario.
            </p>
          )}
        </div>

        <UserSystemAssignmentsField
          inventoryRole={inventoryRole}
          purchasesRole={purchasesRole}
          onInventoryRoleChange={(role) =>
            form.setValue('inventoryRole', role, { shouldValidate: true })
          }
          onPurchasesRoleChange={(role) =>
            form.setValue('purchasesRole', role, { shouldValidate: true })
          }
          error={
            form.formState.errors.inventoryRole?.message ??
            form.formState.errors.purchasesRole?.message
          }
          disabled={disabled}
        />

        <label className="flex cursor-pointer items-center justify-between rounded-xl border p-4">
          <span>
            <span className="block text-sm font-medium">Usuario activo</span>
            <span className="block text-xs text-muted-foreground">
              Un usuario inactivo no podrá iniciar sesión.
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 accent-indigo-600"
            disabled={disabled}
            {...form.register('active')}
          />
        </label>

        {!active && hasAdminRole && (
          <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="size-5 shrink-0" />
            No es posible desactivar al último administrador activo.
          </div>
        )}
        {versionConflict && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            El usuario fue modificado en otra sesión. Cierra este panel y vuelve
            a abrirlo para cargar sus datos más recientes.
          </div>
        )}
        {mutation.error && <ApiErrorAlert error={mutation.error} />}
      </div>

      <SheetFooter className="border-t">
        <Button
          type="button"
          variant="outline"
          onClick={close}
          disabled={disabled}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={disabled}>
          {disabled ? <LoaderCircle className="animate-spin" /> : <Save />}
          Guardar usuario
        </Button>
      </SheetFooter>
    </form>
  );
}

export function UserEditSheet({
  user,
  open,
  onOpenChange,
}: UserEditSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <UserRoundPen />
          </div>
          <SheetTitle>Editar usuario</SheetTitle>
          <SheetDescription>
            Actualiza los datos, permisos y estado de la cuenta.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <UserEditForm
            key={`${user?.id}-${user?.version}`}
            user={user}
            close={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
