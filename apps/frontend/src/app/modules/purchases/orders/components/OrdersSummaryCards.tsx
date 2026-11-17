import { CircleDollarSign, FileClock, FileCheck2, Files } from 'lucide-react';

import { Card, CardContent } from '@shared/components/ui/card';
import { formatMxn, sumMoney } from '@shared/utils/decimal-money.util';

import type { PurchaseOrder } from '../types/purchase-orders.types';

interface OrdersSummaryCardsProps {
  orders: PurchaseOrder[];
  total: number;
}

export function OrdersSummaryCards({ orders, total }: OrdersSummaryCardsProps) {
  const cards = [
    { label: 'Órdenes encontradas', value: String(total), icon: Files },
    {
      label: 'Borradores en página',
      value: String(orders.filter((order) => order.status === 'DRAFT').length),
      icon: FileClock,
    },
    {
      label: 'Enviadas en página',
      value: String(
        orders.filter((order) => order.status === 'SUBMITTED').length,
      ),
      icon: FileCheck2,
    },
    {
      label: 'Importe visible',
      value: formatMxn(sumMoney(orders.map((order) => order.totalAmount))),
      icon: CircleDollarSign,
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
