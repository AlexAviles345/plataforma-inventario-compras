import { Boxes, ShoppingCart } from 'lucide-react';

import { cn } from '@shared/utils/cn';
import type { SystemCode } from '@shared/types/auth-session.types';

const systems = [
  {
    value: 'INVENTORY' as const,
    title: 'Inventario',
    description: 'Catálogo y existencias',
    icon: Boxes,
  },
  {
    value: 'PURCHASES' as const,
    title: 'Compras',
    description: 'Órdenes y proveedores',
    icon: ShoppingCart,
  },
];

interface SystemBadgeSelectorProps {
  value: SystemCode;
  onChange: (value: SystemCode) => void;
  disabled?: boolean;
}

export function SystemBadgeSelector({
  value,
  onChange,
  disabled,
}: SystemBadgeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup">
      {systems.map((system) => {
        const Icon = system.icon;
        const selected = value === system.value;

        return (
          <button
            key={system.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(system.value)}
            className={cn(
              'flex min-h-24 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
              selected
                ? 'border-teal-600 bg-teal-50 text-teal-950 ring-2 ring-teal-600/15 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-50'
                : 'border-border bg-background hover:border-teal-300 hover:bg-muted/50',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold">
                {system.title}
              </span>
              <span className="block text-xs text-muted-foreground">
                {system.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
