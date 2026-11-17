import { useDeferredValue, useState } from 'react';
import { Check, ChevronsUpDown, LoaderCircle, SearchX } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@shared/components/ui/command';
import { Input } from '@shared/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@shared/components/ui/popover';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { cn } from '@shared/utils/cn';

import { useProductsList } from '../hooks/useProductsList';

interface ProductSearchableSelectProps {
  id?: string;
  value: string;
  onChange: (productId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

export function ProductSearchableSelect({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: ProductSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const hasInventorySession = useAuthSessionStore((state) =>
    Boolean(state.sessions.INVENTORY),
  );
  const productsQuery = useProductsList(
    {
      page: 1,
      limit: 50,
      search: deferredSearch.trim() || undefined,
      active: true,
    },
    hasInventorySession && open,
  );
  const selectedProduct = productsQuery.data?.products.find(
    (product) => product.id === value,
  );

  if (!hasInventorySession || productsQuery.isError) {
    return (
      <div className="space-y-1">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="00000000-0000-4000-8000-000000000000"
          className="font-mono text-xs"
          disabled={disabled}
          aria-invalid={invalid}
        />
        <p className="text-[11px] text-muted-foreground">
          {hasInventorySession
            ? 'El catálogo no está disponible; captura el UUID manualmente.'
            : 'Agrega una sesión de Inventario para buscar por SKU o nombre.'}
        </p>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className="w-full justify-between px-3 font-normal"
        >
          <span className="truncate text-left">
            {selectedProduct
              ? `${selectedProduct.sku} — ${selectedProduct.name}`
              : value || 'Buscar producto activo…'}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(32rem,var(--radix-popover-trigger-width))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por SKU o nombre…"
          />
          <CommandList>
            {productsQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="animate-spin" /> Cargando catálogo…
              </div>
            )}
            {!productsQuery.isLoading && (
              <CommandEmpty>
                <SearchX className="mx-auto mb-2 size-5" />
                No se encontraron productos activos.
              </CommandEmpty>
            )}
            <CommandGroup>
              {productsQuery.data?.products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={() => {
                    onChange(product.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      'size-4',
                      value === product.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="font-mono text-xs font-semibold">
                    {product.sku}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {product.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {product.stockOnHand.toLocaleString('es-MX')} disp.
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
