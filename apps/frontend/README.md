# TechDistribution — Frontend Web

Aplicación web empresarial unificada (SPA monolítica modular) planificada sobre **React 19, TypeScript 5, Vite 6, Tailwind CSS v4 y `shadcn/ui`**, diseñada para operar los dominios de **Administración (`auth`)**, **Inventario (`inventory`)** y **Compras (`purchases`)** a través del API Gateway (`http://localhost:3000` en desarrollo y `/` detrás de Nginx en despliegue).

## Documentación y Planificación

- **Contrato general del servicio:** [`docs/services/frontend-web.md`](../../docs/services/frontend-web.md)
- **Plan de implementación por fases y arquitectura modular:** [`docs/services/frontend-implementation-plan.md`](../../docs/services/frontend-implementation-plan.md)
- **Estándar de respuestas HTTP:** [`docs/standards/api-responses.md`](../../docs/standards/api-responses.md)
- **Estándar de access tokens y sesiones:** [`docs/standards/jwt-and-sessions.md`](../../docs/standards/jwt-and-sessions.md)

## Resumen de Fases de Implementación

1. **Fase 1:** Scaffold React + TypeScript + Vite, Tailwind CSS v4, primitivas `shadcn/ui`, tipos de envoltura HTTP y utilidades de dinero exacto (`decimal.js`) en `src/app/(shared)/`.
2. **Fase 2:** Cliente HTTP con interceptores (`Authorization`, `Idempotency-Key`, `X-Request-Id` y reintentos automáticos ante `409 PROJECTION_NOT_READY`), store de sesión multi-sistema (`Zustand`), módulo `(auth)/login` y shell `(modules)/layout.tsx`.
3. **Fase 3:** Módulo de Compras (`(modules)/purchases/orders`) — listado paginado, alta/edición maestro-detalle de hasta 100 líneas, snapshots históricos, transiciones `submit`/`cancel` e historial auditable.
4. **Fase 4:** Módulo de Inventario (`(modules)/inventory/products`) — catálogo paginado, creación de productos, ajustes de stock con motivo saneado y desactivación lógica con `expectedVersion`.
5. **Fase 5:** Módulo de Administración (`(modules)/administration`) — gestión de usuarios, matriz de asignaciones `{ system, role }` y configuración de TTL por sistema.
6. **Fase 6:** Suite de pruebas automatizadas (`Vitest` + `MSW` + `Playwright`), `Dockerfile` multi-stage e integración con Nginx Edge y CI.
