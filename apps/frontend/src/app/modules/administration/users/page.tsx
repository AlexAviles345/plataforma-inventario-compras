import { useState } from 'react';
import { Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { PaginationControls } from '@shared/components/data-display/PaginationControls';
import { Skeleton } from '@shared/components/ui/skeleton';

import { UserCreateDialog } from './components/UserCreateDialog';
import { UserEditSheet } from './components/UserEditSheet';
import { UsersSummaryCards } from './components/UsersSummaryCards';
import { UsersTable } from './components/UsersTable';
import { useAdminUsersList } from './hooks/useAdminUsersList';
import type { AdminUser } from './types/users-admin.types';

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedUser, setSelectedUser] = useState<AdminUser>();
  const filters = {
    page: positiveInteger(searchParams.get('page'), 1),
    limit: Math.min(positiveInteger(searchParams.get('limit'), 20), 100),
  };
  const usersQuery = useAdminUsersList(filters);
  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(page));
    params.set('limit', String(filters.limit));
    setSearchParams(params);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            <Users className="size-4" /> Administración
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Crea identidades, asigna permisos por sistema y administra su estado
            mediante control optimista.
          </p>
        </div>
        <UserCreateDialog />
      </header>

      {usersQuery.isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      )}

      {usersQuery.error && <ApiErrorAlert error={usersQuery.error} />}

      {usersQuery.data && (
        <>
          <UsersSummaryCards
            users={usersQuery.data.users}
            total={usersQuery.data.meta.total}
          />
          {usersQuery.data.users.length ? (
            <UsersTable
              users={usersQuery.data.users}
              onEdit={setSelectedUser}
            />
          ) : (
            <div className="rounded-xl border border-dashed bg-card py-16 text-center">
              <Users className="mx-auto size-9 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">No hay usuarios</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
                Registra el primer usuario para comenzar a asignar permisos.
              </p>
            </div>
          )}
          <PaginationControls
            meta={usersQuery.data.meta}
            onPageChange={setPage}
          />
        </>
      )}

      <UserEditSheet
        user={selectedUser}
        open={Boolean(selectedUser)}
        onOpenChange={(open) => {
          if (!open) setSelectedUser(undefined);
        }}
      />
    </div>
  );
}
