import { AlertCircle, PackageSearch } from 'lucide-react';

import { StatusBadge } from '@shared/components/data-display/StatusBadge';
import { Badge } from '@shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
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

import type {
  PurchaseOrder,
  PurchaseOrderLine,
} from '../types/purchase-orders.types';

function catalogChanged(line: PurchaseOrderLine): boolean {
  const current = line.currentCatalog;
  return Boolean(
    current &&
    (current.sku !== line.skuSnapshot ||
      current.name !== line.nameSnapshot ||
      current.unit !== line.unit ||
      !current.active),
  );
}

export function OrderDetailPanel({ order }: { order: PurchaseOrder }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Proveedor</p>
            <p className="mt-1 truncate font-semibold">{order.supplierName}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Estado</p>
            <div className="mt-1">
              <StatusBadge status={order.status} />
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Importe total</p>
            <p className="mt-1 font-semibold">{formatMxn(order.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Versión</p>
            <p className="mt-1 font-semibold">{order.version}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos de la orden</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto histórico</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Catálogo actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => {
                  const changed = catalogChanged(line);
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <p className="font-medium">{line.nameSnapshot}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.skuSnapshot} · {line.unit}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {line.productId}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        {line.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMxn(line.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMxn(line.lineTotal)}
                      </TableCell>
                      <TableCell>
                        {line.currentCatalog ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {line.currentCatalog.name}
                              </span>
                              {changed && (
                                <Badge variant="outline">Cambió</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {line.currentCatalog.sku} · stock{' '}
                              {line.currentCatalog.stockOnHand}
                            </p>
                            {!line.currentCatalog.active && (
                              <p className="flex items-center gap-1 text-xs text-destructive">
                                <AlertCircle className="size-3" /> Producto
                                inactivo
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <PackageSearch className="size-4" /> Sin referencia
                            actual
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Solicitante</p>
          <p className="mt-1 break-all font-mono text-xs">
            {order.requesterId}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Creada</p>
          <p className="mt-1">{formatUtcDateTime(order.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Última actualización</p>
          <p className="mt-1">{formatUtcDateTime(order.updatedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Último actor</p>
          <p className="mt-1 break-all font-mono text-xs">
            {order.lastModifiedBy}
          </p>
        </div>
      </div>
    </div>
  );
}
