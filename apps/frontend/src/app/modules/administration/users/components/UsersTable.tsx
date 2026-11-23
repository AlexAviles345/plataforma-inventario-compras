import { Pencil, ShieldCheck, UserRoundX } from 'lucide-react';

import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shared/components/ui/table';
import { formatUtcDateTime } from '@shared/utils/date-utc.util';

import type { AdminUser } from '../types/users-admin.types';

const ROLE_LABELS = {
  ADMIN: 'Administrador',
  INVENTORY_MANAGER: 'Gestor de inventario',
  PURCHASES_AGENT: 'Agente de compras',
} as const;

const SYSTEM_LABELS = {
  INVENTORY: 'Inventario',
  PURCHASES: 'Compras',
} as const;

export function UsersTable({
  users,
  onEdit,
}: {
  users: AdminUser[];
  onEdit: (user: AdminUser) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <p className="font-medium">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-52 flex-wrap gap-1.5">
                    {user.assignments.map((assignment) => (
                      <Badge key={assignment.system} variant="secondary">
                        {SYSTEM_LABELS[assignment.system] ?? assignment.system}{' '}
                        · {ROLE_LABELS[assignment.role]}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {user.active ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      <ShieldCheck /> Activo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <UserRoundX /> Inactivo
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatUtcDateTime(user.updatedAt)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(user)}
                  >
                    <Pencil /> Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
