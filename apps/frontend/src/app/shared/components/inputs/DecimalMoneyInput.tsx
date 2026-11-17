import type { ComponentProps } from 'react';

import { Input } from '@shared/components/ui/input';
import { cn } from '@shared/utils/cn';

export function DecimalMoneyInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        inputMode="decimal"
        placeholder="0.00"
        className={cn('pr-12 pl-7 font-mono', className)}
        {...props}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
        MXN
      </span>
    </div>
  );
}
