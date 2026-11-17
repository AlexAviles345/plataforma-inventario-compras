import { Boxes, Check, ChevronDown, Plus, ShoppingCart } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import type { SystemCode } from '@shared/types/auth-session.types';

const systemLabels: Record<SystemCode, string> = {
  INVENTORY: 'Inventario',
  PURCHASES: 'Compras',
};

export function SystemSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useAuthSessionStore((state) => state.sessions);
  const activeSystem = useAuthSessionStore((state) => state.activeSystem);
  const setActiveSystem = useAuthSessionStore((state) => state.setActiveSystem);

  const switchSystem = (system: SystemCode) => {
    if (setActiveSystem(system)) navigate('/dashboard');
  };
  const connectSystem = () => {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    navigate(`/login?returnTo=${returnTo}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-44 justify-between">
          {activeSystem === 'PURCHASES' ? (
            <ShoppingCart aria-hidden="true" />
          ) : (
            <Boxes aria-hidden="true" />
          )}
          <span className="truncate">
            {activeSystem ? systemLabels[activeSystem] : 'Seleccionar sistema'}
          </span>
          <ChevronDown className="opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sesiones disponibles</DropdownMenuLabel>
        {(['INVENTORY', 'PURCHASES'] as const).map((system) => {
          const enabled = Boolean(sessions[system]);
          const Icon = system === 'INVENTORY' ? Boxes : ShoppingCart;
          return (
            <DropdownMenuItem
              key={system}
              disabled={!enabled}
              onSelect={() => switchSystem(system)}
            >
              <Icon aria-hidden="true" />
              {systemLabels[system]}
              {activeSystem === system && <Check className="ml-auto" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={connectSystem}>
          <Plus aria-hidden="true" />
          Conectar otro sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
