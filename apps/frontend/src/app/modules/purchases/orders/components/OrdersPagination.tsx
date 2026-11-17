import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import type { PaginationMeta } from '@shared/types/api-envelope.types';

interface OrdersPaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function OrdersPagination({
  meta,
  onPageChange,
}: OrdersPaginationProps) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
      <p>
        Página {meta.page} de {Math.max(meta.totalPages, 1)} · {meta.total}{' '}
        resultado(s)
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft /> Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Siguiente <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
