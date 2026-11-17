import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@shared/components/data-display/StatusBadge';
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
import { formatMxn } from '@shared/utils/decimal-money.util';

import type { PurchaseOrder } from '../types/purchase-orders.types';

const columnHelper = createColumnHelper<PurchaseOrder>();

interface OrdersTableProps {
  orders: PurchaseOrder[];
  showRequester: boolean;
}

export function OrdersTable({ orders, showRequester }: OrdersTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: 'Orden',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs font-medium">
            {getValue().slice(0, 8)}…
          </span>
        ),
      }),
      columnHelper.accessor('supplierName', {
        header: 'Proveedor',
        cell: ({ getValue, row }) => (
          <div>
            <p className="max-w-64 truncate font-medium">{getValue()}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.lines.length} línea(s)
            </p>
          </div>
        ),
      }),
      ...(showRequester
        ? [
            columnHelper.accessor('requesterId', {
              header: 'Solicitante',
              cell: ({ getValue }) => (
                <span className="font-mono text-xs">
                  {getValue().slice(0, 8)}…
                </span>
              ),
            }),
          ]
        : []),
      columnHelper.accessor('status', {
        header: 'Estado',
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      }),
      columnHelper.accessor('totalAmount', {
        header: () => <span className="block text-right">Importe</span>,
        cell: ({ getValue }) => (
          <span className="block text-right font-medium">
            {formatMxn(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Creada',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatUtcDateTime(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/purchases/orders/${row.original.id}`}>
              Ver <ArrowRight />
            </Link>
          </Button>
        ),
      }),
    ],
    [showRequester],
  );
  // TanStack Table v8 expone funciones mutables por diseño; no se pasan a componentes memoizados.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
