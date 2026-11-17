import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FoundationPage } from '@/app/page';
import '@/app/globals.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontró el elemento raíz de la aplicación');
}

createRoot(root).render(
  <StrictMode>
    <FoundationPage />
  </StrictMode>,
);
