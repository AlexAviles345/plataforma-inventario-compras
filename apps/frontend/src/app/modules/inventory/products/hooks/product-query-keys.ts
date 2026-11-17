import type { ProductsListFilters } from '../types/products.types';

export const productQueryKeys = {
  all: ['inventory-products'] as const,
  lists: () => [...productQueryKeys.all, 'list'] as const,
  list: (filters: ProductsListFilters) =>
    [...productQueryKeys.lists(), filters] as const,
};
