import { ShieldCheck, UserRoundCheck, UserRoundX, Users } from 'lucide-react';

import { Card, CardContent } from '@shared/components/ui/card';

import type { AdminUser } from '../types/users-admin.types';

export function UsersSummaryCards({ users }: { users: AdminUser[] }) {
  const cards = [
    { label: 'Conocidos en sesión', value: users.length, icon: Users },
    {
      label: 'Activos',
      value: users.filter((user) => user.active).length,
      icon: UserRoundCheck,
    },
    {
      label: 'Inactivos',
      value: users.filter((user) => !user.active).length,
      icon: UserRoundX,
    },
    {
      label: 'Administradores',
      value: users.filter((user) =>
        user.assignments.some((assignment) => assignment.role === 'ADMIN'),
      ).length,
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="py-4">
            <CardContent className="flex items-center justify-between gap-3 px-4">
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-xl font-semibold">{card.value}</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                <Icon className="size-4.5" />
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
