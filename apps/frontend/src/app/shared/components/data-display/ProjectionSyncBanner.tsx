import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { isProjectionNotReady } from '@shared/config/query-client.config';

export function ProjectionSyncBanner() {
  const pendingQueries = useIsFetching({
    predicate: (query) => isProjectionNotReady(query.state.fetchFailureReason),
  });
  const pendingMutations = useIsMutating({
    predicate: (mutation) => isProjectionNotReady(mutation.state.failureReason),
  });

  if (pendingQueries + pendingMutations === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100"
    >
      <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
      Sincronizando información entre servicios…
    </div>
  );
}
