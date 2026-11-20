import { StrictMode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@/app/globals.css';
import { AppRouter } from '@/app/router/AppRouter';
import { Toaster } from '@shared/components/ui/sonner';
import { TooltipProvider } from '@shared/components/ui/tooltip';
import { queryClient } from '@shared/config/query-client.config';
import { ThemeProvider } from '@shared/contexts/ThemeProvider';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontró el elemento raíz de la aplicación');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <TooltipProvider>
            <AppRouter />
            <Toaster richColors closeButton />
          </TooltipProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
