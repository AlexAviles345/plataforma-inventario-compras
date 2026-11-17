import { ArrowLeft, LoaderCircle, Save } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Button } from '@shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';

import { useOrderForm } from '../hooks/useOrderForm';
import type { PurchaseOrder } from '../types/purchase-orders.types';
import { OrderLinesFieldArray } from './OrderLinesFieldArray';

interface OrderFormEditorProps {
  order?: PurchaseOrder;
}

export function OrderFormEditor({ order }: OrderFormEditorProps) {
  const navigate = useNavigate();
  const { form, mutation, submit, restoredDraft } = useOrderForm({
    order,
    onSaved: (savedOrder) =>
      navigate(`/purchases/orders/${savedOrder.id}`, { replace: true }),
  });
  const disabled = mutation.isPending;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link
              to={order ? `/purchases/orders/${order.id}` : '/purchases/orders'}
            >
              <ArrowLeft /> Volver
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">
            {order ? 'Editar orden' : 'Nueva orden de compra'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {order
              ? `Editando la versión ${order.version} mientras permanezca en borrador.`
              : 'La orden se guardará inicialmente en estado borrador.'}
          </p>
        </div>
        <Button type="submit" size="lg" disabled={disabled}>
          {disabled ? <LoaderCircle className="animate-spin" /> : <Save />}
          {disabled ? 'Guardando…' : order ? 'Guardar cambios' : 'Crear orden'}
        </Button>
      </header>

      {restoredDraft && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          Recuperamos el borrador guardado en esta pestaña y su clave de
          idempotencia.
        </div>
      )}

      {mutation.error && <ApiErrorAlert error={mutation.error} />}

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
          <CardDescription>
            El solicitante se obtiene del JWT y no puede modificarse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xl space-y-2">
            <Label htmlFor="supplierName">Proveedor</Label>
            <Input
              id="supplierName"
              placeholder="Nombre comercial del proveedor"
              maxLength={200}
              disabled={disabled}
              aria-invalid={Boolean(form.formState.errors.supplierName)}
              {...form.register('supplierName')}
            />
            {form.formState.errors.supplierName && (
              <p className="text-sm text-destructive">
                {form.formState.errors.supplierName.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <OrderLinesFieldArray form={form} disabled={disabled} />
        </CardContent>
      </Card>
    </form>
  );
}
