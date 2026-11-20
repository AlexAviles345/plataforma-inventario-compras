import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { ProjectionSyncBanner } from '@shared/components/data-display/ProjectionSyncBanner';
import { DynamicSidebar } from '@shared/components/layout/DynamicSidebar';
import { Header } from '@shared/components/layout/Header';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@shared/components/ui/sheet';

export function ModulesLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/35 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="fixed inset-y-0 left-0 hidden w-68 lg:block">
        <DynamicSidebar />
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <Header onOpenMenu={() => setMobileMenuOpen(true)} />
        <ProjectionSyncBanner />
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-72 border-0 p-0"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Navegación principal</SheetTitle>
          <SheetDescription className="sr-only">
            Accesos disponibles según tu sesión y permisos.
          </SheetDescription>
          <DynamicSidebar onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
