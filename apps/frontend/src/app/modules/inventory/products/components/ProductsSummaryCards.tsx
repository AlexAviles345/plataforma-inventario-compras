import { Boxes, CircleCheck, CircleOff, PackageCheck } from 'lucide-react';

import { Card, CardContent } from '@shared/components/ui/card';

import type { InventoryProduct } from '../types/products.types';

export function ProductsSummaryCards({
  products,
  total,
}: {
  products: InventoryProduct[];
  total: number;
}) {
  const cards = [
    { label: 'Productos encontrados', value: total, icon: Boxes },
    {
      label: 'Activos en página',
      value: products.filter((product) => product.active).length,
      icon: CircleCheck,
    },
    {
      label: 'Inactivos en página',
      value: products.filter((product) => !product.active).length,
      icon: CircleOff,
    },
    {
      label: 'Existencias visibles',
      value: products.reduce((sum, product) => sum + product.stockOnHand, 0),
      icon: PackageCheck,
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
                <p className="mt-1 text-xl font-semibold">
                  {card.value.toLocaleString('es-MX')}
                </p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                <Icon className="size-4.5" />
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
