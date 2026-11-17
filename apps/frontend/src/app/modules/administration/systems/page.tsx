import { useState } from 'react';
import { Settings2 } from 'lucide-react';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Skeleton } from '@shared/components/ui/skeleton';

import { SystemTtlEditDialog } from './components/SystemTtlEditDialog';
import { SystemsCatalogCards } from './components/SystemsCatalogCards';
import { useSystemsList } from './hooks/useSystemsList';
import type { AuthSystemConfiguration } from './types/systems-admin.types';

export function SystemsPage() {
  const systemsQuery = useSystemsList();
  const [selectedSystem, setSelectedSystem] =
    useState<AuthSystemConfiguration>();

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
          <Settings2 className="size-4" /> Administración
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Configuración de sistemas
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Define la vigencia de los futuros access tokens. Los tokens ya
          emitidos conservan su expiración original.
        </p>
      </header>

      {systemsQuery.isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      )}
      {systemsQuery.error && <ApiErrorAlert error={systemsQuery.error} />}
      {systemsQuery.data && (
        <SystemsCatalogCards
          systems={systemsQuery.data}
          onEdit={setSelectedSystem}
        />
      )}

      <SystemTtlEditDialog
        system={selectedSystem}
        open={Boolean(selectedSystem)}
        onOpenChange={(open) => {
          if (!open) setSelectedSystem(undefined);
        }}
      />
    </div>
  );
}
