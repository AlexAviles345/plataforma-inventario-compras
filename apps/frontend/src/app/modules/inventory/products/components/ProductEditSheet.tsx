import { useWatch } from 'react-hook-form';
import { AlertTriangle, LoaderCircle, Save } from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { GatewayApiError } from '@shared/services/gateway-api-error';
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

import { useUpdateProduct } from '../hooks/useUpdateProduct';
import type { InventoryProduct } from '../types/products.types';

interface ProductEditSheetProps {
  product?: InventoryProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProductEditForm({
  product,
  close,
}: {
  product: InventoryProduct;
  close: () => void;
}) {
  const { form, mutation, submit } = useUpdateProduct(product, close);
  const disabled = mutation.isPending;
  const stock = useWatch({ control: form.control, name: 'stockOnHand' });
  const active = useWatch({ control: form.control, name: 'active' });
  const reason = useWatch({ control: form.control, name: 'reason' });
  const stockChanged = stock !== product.stockOnHand;
  const hasVersionConflict =
    mutation.error instanceof GatewayApiError &&
    mutation.error.code === 'VERSION_CONFLICT';

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-5 overflow-y-auto px-4">
        <div className="space-y-2">
          <Label htmlFor="editSku">SKU</Label>
          <Input
            id="editSku"
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
          <Label htmlFor="editName">Nombre</Label>
          <Input
            id="editName"
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
          <Label htmlFor="editStock">Existencias</Label>
          <Input
            id="editStock"
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
        <label className="flex cursor-pointer items-center justify-between rounded-xl border p-4">
          <span>
            <span className="block text-sm font-medium">Producto activo</span>
            <span className="block text-xs text-muted-foreground">
              Los productos inactivos no pueden agregarse a órdenes nuevas.
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 accent-teal-600"
            disabled={disabled}
            {...form.register('active')}
          />
        </label>
        {!active && product.active && (
          <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="size-5 shrink-0" />
            La desactivación es lógica. Las órdenes existentes conservarán sus
            snapshots históricos.
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="editReason">
            Motivo {stockChanged ? 'del ajuste' : 'administrativo'}
          </Label>
          <textarea
            id="editReason"
            rows={4}
            maxLength={500}
            disabled={disabled}
            aria-invalid={Boolean(form.formState.errors.reason)}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...form.register('reason')}
          />
          <div className="flex justify-between text-xs">
            <span className="text-destructive">
              {form.formState.errors.reason?.message}
            </span>
            <span className="text-muted-foreground">
              {reason?.length ?? 0}/500
            </span>
          </div>
        </div>
        {hasVersionConflict && (
          <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="size-5 shrink-0" />
            <div>
              <p className="font-medium">El producto cambió en otra sesión.</p>
              <p className="mt-1">
                Cierra esta edición y vuelve a abrir el producto para trabajar
                con la versión más reciente.
              </p>
            </div>
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
          {disabled ? 'Guardando…' : 'Guardar versión'}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function ProductEditSheet({
  product,
  open,
  onOpenChange,
}: ProductEditSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Editar producto</SheetTitle>
          <SheetDescription>
            {product ? `${product.sku} · versión ${product.version}` : ''}
          </SheetDescription>
        </SheetHeader>
        {product && (
          <ProductEditForm
            key={`${product.id}-${product.version}`}
            product={product}
            close={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
