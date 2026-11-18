import { useState } from 'react';
import { Info, UserRoundPen, Users } from 'lucide-react';

import { Button } from '@shared/components/ui/button';

import { UserCreateDialog } from './components/UserCreateDialog';
import { UserEditSheet } from './components/UserEditSheet';
import { UsersSummaryCards } from './components/UsersSummaryCards';
import { UsersTable } from './components/UsersTable';
import { useKnownAdminUsers } from './hooks/useKnownAdminUsers';
import type { AdminUser } from './types/users-admin.types';

export function UsersPage() {
  const usersQuery = useKnownAdminUsers();
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser>();
  const users = usersQuery.data;

  const editUser = (user?: AdminUser) => {
    setSelectedUser(user);
    setEditOpen(true);
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => editUser()}>
            <UserRoundPen /> Editar por UUID
          </Button>
          <UserCreateDialog />
        </div>
      </header>

      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <Info className="size-5 shrink-0" />
        <p>
          Auth ya ofrece una consulta paginada de usuarios, pero esta versión
          del frontend aún no la integra. La tabla muestra únicamente usuarios
          creados o actualizados durante la sesión actual.
        </p>
      </div>

      <UsersSummaryCards users={users} />

      {users.length ? (
        <UsersTable users={users} onEdit={editUser} />
      ) : (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <Users className="mx-auto size-9 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">
            Sin usuarios conocidos en sesión
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Crea un usuario nuevo o usa “Editar por UUID” con una referencia y
            versión conocidas.
          </p>
        </div>
      )}

      <UserEditSheet
        user={selectedUser}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setSelectedUser(undefined);
        }}
      />
    </div>
  );
}
