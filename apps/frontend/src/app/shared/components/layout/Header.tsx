import { Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@shared/components/ui/button';
import { BreadcrumbNav } from './BreadcrumbNav';
import { SystemSwitcher } from './SystemSwitcher';

interface HeaderProps {
  onOpenMenu: () => void;
}

export function Header({ onOpenMenu }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <header className="flex h-18 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Abrir navegación"
      >
        <Menu aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <BreadcrumbNav />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        aria-label={dark ? 'Usar tema claro' : 'Usar tema oscuro'}
      >
        {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
      <SystemSwitcher />
    </header>
  );
}
