import { useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/components/ui/select';

interface ProductsFilterBarProps {
  search?: string;
  active?: boolean;
  onChange: (filters: { search?: string; active?: boolean }) => void;
}

export function ProductsFilterBar({
  search,
  active,
  onChange,
}: ProductsFilterBarProps) {
  const [term, setTerm] = useState(search ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ search: term.trim() || undefined, active });
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[1fr_14rem_auto] md:items-end"
    >
      <div className="space-y-2">
        <Label htmlFor="productSearch">Buscar producto</Label>
        <Input
          id="productSearch"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="SKU o nombre"
        />
      </div>
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select
          value={active === undefined ? 'ALL' : String(active)}
          onValueChange={(value) =>
            onChange({
              search: term.trim() || undefined,
              active: value === 'ALL' ? undefined : value === 'true',
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="true">Activos</SelectItem>
            <SelectItem value="false">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="outline">
          <Search /> Buscar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Limpiar filtros"
          onClick={() => {
            setTerm('');
            onChange({});
          }}
        >
          <X />
        </Button>
      </div>
    </form>
  );
}
