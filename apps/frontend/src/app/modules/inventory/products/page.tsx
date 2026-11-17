import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { PaginationControls } from '@shared/components/data-display/PaginationControls';
import { Skeleton } from '@shared/components/ui/skeleton';

import { ProductCreateDialog } from './components/ProductCreateDialog';
import { ProductEditSheet } from './components/ProductEditSheet';
import { ProductsFilterBar } from './components/ProductsFilterBar';
import { ProductsSummaryCards } from './components/ProductsSummaryCards';
import { ProductsTable } from './components/ProductsTable';
import { useProductsList } from './hooks/useProductsList';
import type {
  InventoryProduct,
  ProductsListFilters,
} from './types/products.types';

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function activeFilter(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct>();
  const filters: ProductsListFilters = {
    page: positiveInteger(searchParams.get('page'), 1),
    limit: Math.min(positiveInteger(searchParams.get('limit'), 20), 100),
    search: searchParams.get('search') || undefined,
    active: activeFilter(searchParams.get('active')),
  };
  const productsQuery = useProductsList(filters);

  const updateFilters = (next: { search?: string; active?: boolean }) => {
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('limit', String(filters.limit));
    if (next.search) params.set('search', next.search);
    if (next.active !== undefined) params.set('active', String(next.active));
    setSearchParams(params);
  };
  const setPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(page));
    setSearchParams(params);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300">
            <Boxes className="size-4" /> Inventario
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Catálogo de productos
          </h1>
          <p className="mt-2 text-muted-foreground">
            Administra productos, existencias y disponibilidad operativa.
          </p>
        </div>
        <ProductCreateDialog />
      </header>

      <ProductsFilterBar
        key={`${filters.search ?? ''}-${String(filters.active)}`}
        search={filters.search}
        active={filters.active}
        onChange={updateFilters}
      />

      {productsQuery.isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      )}

      {productsQuery.error && <ApiErrorAlert error={productsQuery.error} />}

      {productsQuery.data && (
        <>
          <ProductsSummaryCards
            products={productsQuery.data.products}
            total={productsQuery.data.meta.total}
          />
          {productsQuery.data.products.length ? (
            <ProductsTable
              products={productsQuery.data.products}
              onEdit={setSelectedProduct}
            />
          ) : (
            <div className="rounded-xl border border-dashed bg-card py-16 text-center">
              <Boxes className="mx-auto size-9 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">No hay productos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajusta los filtros o registra el primer producto.
              </p>
            </div>
          )}
          <PaginationControls
            meta={productsQuery.data.meta}
            onPageChange={setPage}
          />
        </>
      )}

      <ProductEditSheet
        product={selectedProduct}
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(undefined);
        }}
      />
    </div>
  );
}
