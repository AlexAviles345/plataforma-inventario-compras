import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Pencil } from 'lucide-react';

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

import type { InventoryProduct } from '../types/products.types';

const columnHelper = createColumnHelper<InventoryProduct>();

export function ProductsTable({
  products,
  onEdit,
}: {
  products: InventoryProduct[];
  onEdit: (product: InventoryProduct) => void;
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('sku', {
        header: 'SKU',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs font-semibold">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('name', {
        header: 'Producto',
        cell: ({ getValue, row }) => (
          <div>
            <p className="max-w-72 truncate font-medium">{getValue()}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {row.original.id}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor('stockOnHand', {
        header: () => <span className="block text-right">Existencias</span>,
        cell: ({ getValue }) => (
          <span className="block text-right font-semibold">
            {getValue().toLocaleString('es-MX')}
          </span>
        ),
      }),
      columnHelper.accessor('active', {
        header: 'Estado',
        cell: ({ getValue }) =>
          getValue() ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Activo
            </Badge>
          ) : (
            <Badge variant="secondary">Inactivo</Badge>
          ),
      }),
      columnHelper.accessor('version', {
        header: 'Versión',
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor('updatedAt', {
        header: 'Actualizado',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatUtcDateTime(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(row.original)}
          >
            <Pencil /> Editar
          </Button>
        ),
      }),
    ],
    [onEdit],
  );
  // TanStack Table v8 expone funciones mutables por diseño; no se pasan a componentes memoizados.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
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
