import { useQuery } from '@tanstack/react-query';

import { listSystems } from '../services/systems-admin.service';
import { systemQueryKeys } from './system-query-keys';

export function useSystemsList() {
  return useQuery({
    queryKey: systemQueryKeys.list(),
    queryFn: listSystems,
  });
}
