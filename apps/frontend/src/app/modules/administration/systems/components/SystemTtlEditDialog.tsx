import { Clock3, LoaderCircle, Save } from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { GatewayApiError } from '@shared/services/gateway-api-error';

import { useUpdateSystemTtl } from '../hooks/useUpdateSystemTtl';
import type { AuthSystemConfiguration } from '../types/systems-admin.types';

interface SystemTtlEditDialogProps {
  system?: AuthSystemConfiguration;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SystemTtlForm({
  system,
  close,
}: {
  system: AuthSystemConfiguration;
  close: () => void;
}) {
  const { form, mutation, submit } = useUpdateSystemTtl(system, close);
  const ttl = form.watch('accessTokenTtlSeconds');
  const versionConflict =
    mutation.error instanceof GatewayApiError &&
    mutation.error.code === 'VERSION_CONFLICT';

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="accessTokenTtlSeconds">Vigencia en segundos</Label>
        <Input
          id="accessTokenTtlSeconds"
          type="number"
          min={60}
          max={3600}
          step={1}
          disabled={mutation.isPending}
          aria-invalid={Boolean(form.formState.errors.accessTokenTtlSeconds)}
          {...form.register('accessTokenTtlSeconds', { valueAsNumber: true })}
        />
        {form.formState.errors.accessTokenTtlSeconds && (
          <p className="text-sm text-destructive">
            {form.formState.errors.accessTokenTtlSeconds.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Equivale aproximadamente a{' '}
          {Number.isFinite(ttl) ? (ttl / 60).toFixed(1) : '0.0'} minutos. Solo
          afecta tokens emitidos después del cambio.
        </p>
      </div>

      {versionConflict && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          La configuración cambió en otra sesión. Cierra el diálogo y vuelve a
          abrirlo para usar la versión más reciente.
        </div>
      )}
      {mutation.error && <ApiErrorAlert error={mutation.error} />}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={close}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Save />
          )}
          Guardar vigencia
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SystemTtlEditDialog({
  system,
  open,
  onOpenChange,
}: SystemTtlEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <Clock3 />
          </div>
          <DialogTitle>Vigencia JWT de {system?.code}</DialogTitle>
          <DialogDescription>
            Configuración versión {system?.version}. El servidor aplicará además
            su límite JWT_MAX_TTL_SECONDS.
          </DialogDescription>
        </DialogHeader>
        {system && (
          <SystemTtlForm
            key={`${system.code}-${system.version}`}
            system={system}
            close={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
