import type { PaginationMeta } from '@shared/types/api-envelope.types';

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  unit: 'UNIT';
  stockOnHand: number;
  active: boolean;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductsListFilters {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
}

export interface PaginatedProducts {
  products: InventoryProduct[];
  meta: PaginationMeta;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  unit: 'UNIT';
  stockOnHand: number;
}

export interface UpdateProductInput {
  expectedVersion: number;
  sku: string;
  name: string;
  stockOnHand: number;
  active: boolean;
  reason?: string;
}
