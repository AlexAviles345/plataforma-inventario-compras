import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listProducts } from '../services/products.service';
import type { ProductsListFilters } from '../types/products.types';
import { productQueryKeys } from './product-query-keys';

export function useProductsList(filters: ProductsListFilters, enabled = true) {
  return useQuery({
    queryKey: productQueryKeys.list(filters),
    queryFn: () => listProducts(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}
