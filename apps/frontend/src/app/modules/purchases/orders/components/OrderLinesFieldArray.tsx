import {
  Controller,
  useFieldArray,
  useWatch,
  type UseFormReturn,
} from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';

import { ProductSearchableSelect } from '@modules/inventory/products';
import { DecimalMoneyInput } from '@shared/components/inputs/DecimalMoneyInput';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import {
  formatMxn,
  multiplyMoney,
  sumMoney,
} from '@shared/utils/decimal-money.util';

import type { OrderFormValues } from '../schemas/order-form.schema';

function lineTotal(quantity?: number, unitPrice?: string) {
  try {
    return multiplyMoney(quantity ?? 0, unitPrice ?? '');
  } catch {
    return undefined;
  }
}

interface OrderLinesFieldArrayProps {
  form: UseFormReturn<OrderFormValues>;
  disabled?: boolean;
}

export function OrderLinesFieldArray({
  form,
  disabled,
}: OrderLinesFieldArrayProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });
  const lines = useWatch({ control: form.control, name: 'lines' });
  const validTotals = lines
    .map((line) => lineTotal(line.quantity, line.unitPrice))
    .filter((value) => value !== undefined);
  const total = sumMoney(validTotals);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Líneas de la orden</h2>
          <p className="text-sm text-muted-foreground">
            Captura entre 1 y 100 productos sin repetir UUID.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || fields.length >= 100}
          onClick={() => append({ productId: '', quantity: 1, unitPrice: '' })}
        >
          <Plus /> Agregar línea
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => {
          const calculated = lineTotal(
            lines[index]?.quantity,
            lines[index]?.unitPrice,
          );
          const errors = form.formState.errors.lines?.[index];

          return (
            <div
              key={field.id}
              className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[minmax(15rem,1.5fr)_9rem_12rem_10rem_auto] lg:items-start"
            >
              <div className="space-y-2">
                <Label htmlFor={`lines.${index}.productId`}>
                  Producto UUID
                </Label>
                <Controller
                  control={form.control}
                  name={`lines.${index}.productId`}
                  render={({ field: productField }) => (
                    <ProductSearchableSelect
                      id={`lines.${index}.productId`}
                      value={productField.value}
                      onChange={productField.onChange}
                      disabled={disabled}
                      invalid={Boolean(errors?.productId)}
                    />
                  )}
                />
                {errors?.productId && (
                  <p className="text-xs text-destructive">
                    {errors.productId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`lines.${index}.quantity`}>Cantidad</Label>
                <Input
                  id={`lines.${index}.quantity`}
                  type="number"
                  min={1}
                  step={1}
                  disabled={disabled}
                  aria-invalid={Boolean(errors?.quantity)}
                  {...form.register(`lines.${index}.quantity`, {
                    valueAsNumber: true,
                  })}
                />
                {errors?.quantity && (
                  <p className="text-xs text-destructive">
                    {errors.quantity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`lines.${index}.unitPrice`}>
                  Precio unitario
                </Label>
                <DecimalMoneyInput
                  id={`lines.${index}.unitPrice`}
                  disabled={disabled}
                  aria-invalid={Boolean(errors?.unitPrice)}
                  {...form.register(`lines.${index}.unitPrice`)}
                />
                {errors?.unitPrice && (
                  <p className="text-xs text-destructive">
                    {errors.unitPrice.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Importe</Label>
                <div className="flex h-9 items-center rounded-md bg-muted px-3 text-sm font-semibold">
                  {calculated ? formatMxn(calculated) : '—'}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-7 text-destructive hover:text-destructive"
                disabled={disabled || fields.length === 1}
                onClick={() => remove(index)}
                aria-label={`Eliminar línea ${index + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>

      {form.formState.errors.lines?.root?.message && (
        <p className="text-sm text-destructive">
          {form.formState.errors.lines.root.message}
        </p>
      )}

      <div className="flex justify-end">
        <div className="min-w-64 rounded-xl bg-slate-950 p-4 text-white dark:bg-white dark:text-slate-950">
          <p className="text-xs opacity-70">Total estimado</p>
          <p className="mt-1 text-2xl font-semibold">{formatMxn(total)}</p>
        </div>
      </div>
    </div>
  );
}
