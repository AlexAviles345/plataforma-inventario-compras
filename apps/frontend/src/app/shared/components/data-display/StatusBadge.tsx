import { Badge } from '@shared/components/ui/badge';
import { cn } from '@shared/utils/cn';

const labels: Record<string, string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  CANCELLED: 'Cancelada',
  CREATED: 'Creada',
  UPDATED: 'Actualizada',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap',
        status === 'DRAFT' &&
          'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
        status === 'SUBMITTED' &&
          'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200',
        status === 'CANCELLED' &&
          'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
        status === 'CREATED' &&
          'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
        status === 'UPDATED' &&
          'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200',
      )}
    >
      {labels[status] ?? status}
    </Badge>
  );
}
