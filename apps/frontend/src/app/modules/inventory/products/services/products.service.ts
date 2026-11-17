import { apiRequest } from '@shared/services/http-client';

import type {
  CreateProductInput,
  InventoryProduct,
  PaginatedProducts,
  ProductsListFilters,
  UpdateProductInput,
} from '../types/products.types';

const PRODUCTS_PATH = '/api/inventory/products';

export async function listProducts(
  filters: ProductsListFilters,
): Promise<PaginatedProducts> {
  const result = await apiRequest<InventoryProduct[]>({
    method: 'GET',
    url: PRODUCTS_PATH,
    requiredSystem: 'INVENTORY',
    params: {
      page: filters.page,
      limit: filters.limit,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
    },
  });

  if (!result.meta) {
    throw new Error('El catálogo no incluyó metadatos de paginación');
  }

  return { products: result.data, meta: result.meta };
}

export async function createProduct(
  input: CreateProductInput,
): Promise<InventoryProduct> {
  const result = await apiRequest<InventoryProduct, CreateProductInput>({
    method: 'POST',
    url: PRODUCTS_PATH,
    data: input,
    requiredSystem: 'INVENTORY',
  });
  return result.data;
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
): Promise<InventoryProduct> {
  const result = await apiRequest<InventoryProduct, UpdateProductInput>({
    method: 'PUT',
    url: `${PRODUCTS_PATH}/${productId}`,
    data: input,
    requiredSystem: 'INVENTORY',
  });
  return result.data;
}
