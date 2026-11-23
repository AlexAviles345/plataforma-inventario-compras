import { useState } from 'react';
import { LoaderCircle, PackagePlus, Plus } from 'lucide-react';

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

import { useCreateProduct } from '../hooks/useCreateProduct';

export function ProductCreateDialog() {
  const [open, setOpen] = useState(false);
  const { form, mutation, submit } = useCreateProduct(() => setOpen(false));
  const disabled = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus /> Nuevo producto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200">
            <PackagePlus />
          </div>
          <DialogTitle>Registrar producto</DialogTitle>
          <DialogDescription>
            Ingresa los datos del producto para darlo de alta en el catálogo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="createSku">SKU</Label>
            <Input
              id="createSku"
              placeholder="LAP-001"
              maxLength={64}
              className="font-mono uppercase"
              disabled={disabled}
              aria-invalid={Boolean(form.formState.errors.sku)}
              {...form.register('sku')}
            />
            {form.formState.errors.sku && (
              <p className="text-sm text-destructive">
                {form.formState.errors.sku.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="createName">Nombre</Label>
            <Input
              id="createName"
              placeholder="Nombre descriptivo"
              maxLength={200}
              disabled={disabled}
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="createStock">Existencias iniciales</Label>
            <Input
              id="createStock"
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              aria-invalid={Boolean(form.formState.errors.stockOnHand)}
              {...form.register('stockOnHand', { valueAsNumber: true })}
            />
            {form.formState.errors.stockOnHand && (
              <p className="text-sm text-destructive">
                {form.formState.errors.stockOnHand.message}
              </p>
            )}
          </div>
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
              {disabled ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {disabled ? 'Guardando…' : 'Crear producto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
