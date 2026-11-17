import { PaginationControls } from '@shared/components/data-display/PaginationControls';
import type { PaginationMeta } from '@shared/types/api-envelope.types';

interface OrdersPaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function OrdersPagination({
  meta,
  onPageChange,
}: OrdersPaginationProps) {
  return <PaginationControls meta={meta} onPageChange={onPageChange} />;
}
