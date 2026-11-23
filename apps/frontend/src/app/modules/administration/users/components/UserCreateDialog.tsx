import { useState } from 'react';
import { Eye, EyeOff, LoaderCircle, UserPlus } from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';

import { useCreateUser } from '../hooks/useCreateUser';
import { UserSystemAssignmentsField } from './UserSystemAssignmentsField';

export function UserCreateDialog() {
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { form, mutation, submit } = useCreateUser(() => setOpen(false));
  const disabled = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <UserPlus /> Nuevo usuario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogDescription>
            Completa los datos de la cuenta y asigna los permisos por área.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="createUserEmail">Correo</Label>
              <Input
                id="createUserEmail"
                type="email"
                autoComplete="off"
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
              <Label htmlFor="createDisplayName">Nombre visible</Label>
              <Input
                id="createDisplayName"
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="createUserPassword">Contraseña inicial</Label>
            <div className="relative">
              <Input
                id="createUserPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={12}
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
                Debe contener al menos 12 caracteres.
              </p>
            )}
          </div>
          <UserSystemAssignmentsField
            inventoryRole={form.watch('inventoryRole')}
            purchasesRole={form.watch('purchasesRole')}
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
          {mutation.error && <ApiErrorAlert error={mutation.error} />}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={disabled}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={disabled}>
              {disabled ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <UserPlus />
              )}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
