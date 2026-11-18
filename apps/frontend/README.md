# TechDistribution — Frontend Web

Aplicación web empresarial unificada (SPA monolítica modular) sobre **React 19, TypeScript 5, Vite 6, Tailwind CSS v4 y `shadcn/ui`**, diseñada para operar los dominios de **Administración (`auth`)**, **Inventario (`inventory`)** y **Compras (`purchases`)** a través del API Gateway (`http://localhost:3000` en desarrollo y `/` detrás de Nginx en despliegue).

**Estado:** Fases 1 a 6 completadas. La aplicación incluye Compras, Inventario, Administración, pruebas Vitest/MSW y Playwright, imagen Docker multi-stage, Nginx Edge y validación en GitHub Actions. Auth ya implementa login, usuarios y sistemas; Inventory continúa condicionado a la implementación de sus rutas de negocio. La pantalla de usuarios aún conserva en memoria los recursos creados o actualizados durante la sesión y tiene pendiente integrar la consulta paginada ya disponible en Auth.

## Inicio local

Requisitos: Node.js 24.x y npm 11.x. Desde esta carpeta:

```bash
npm ci
npm run dev
```

La aplicación queda disponible en <http://localhost:5173>. En desarrollo, Vite reenvía las solicitudes a `/api/**` hacia `API_PROXY_TARGET` o, si no se define, hacia `http://localhost:3000`.

También puede iniciarse junto con todos los backends mediante `npm run dev` desde la raíz del repositorio.

| Comando                 | Acción                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Inicia Vite en modo desarrollo y conserva el puerto `5173` |
| `npm run build`         | Ejecuta TypeScript y genera el bundle de producción        |
| `npm run typecheck`     | Valida tipos sin generar el bundle                         |
| `npm run lint`          | Ejecuta ESLint sin admitir advertencias                    |
| `npm run format:check`  | Comprueba el formato con Prettier                          |
| `npm run format`        | Aplica el formato de Prettier                              |
| `npm run preview`       | Sirve localmente el bundle generado                        |
| `npm test`              | Ejecuta pruebas unitarias y de integración con Vitest/MSW  |
| `npm run test:coverage` | Genera cobertura V8 en `coverage/`                         |
| `npm run test:e2e`      | Compila y ejecuta los recorridos Playwright en Chromium    |

Antes de la primera ejecución E2E instala Chromium con `npx playwright install chromium`. En CI se instala también el conjunto de dependencias del sistema.

## Docker y Nginx Edge

`apps/frontend/Dockerfile` genera el bundle con Node 24 y lo sirve desde Nginx sin privilegios en el puerto interno `8080`. Desde la raíz, con el Gateway ya disponible en `localhost:3000`:

```bash
npm run dev:edge
```

El edge queda en <http://localhost:8088>, entrega el frontend en `/` y reenvía `/api/**`, `/health/**` y `/docs` al Gateway. `npm run dev:edge:down` detiene el perfil.

## Base compartida implementada

- `src/app/shared/components/ui/`: primitivas reutilizables de `shadcn/ui`.
- `src/app/shared/types/`: envolturas HTTP, detalles de validación, metadatos de paginación y códigos de error.
- `src/app/shared/utils/`: clases CSS, dinero decimal exacto `(18, 2)` y fechas ISO 8601 UTC.
- `src/app/globals.css`: tokens semánticos para los temas claro y oscuro.

## Documentación y Planificación

- **Contrato general del servicio:** [`docs/services/frontend-web/frontend-web.md`](../../docs/services/frontend-web/frontend-web.md)
- **Plan de implementación por fases y arquitectura modular:** [`docs/services/frontend-web/frontend-implementation-plan.md`](../../docs/services/frontend-web/frontend-implementation-plan.md)
- **Estándar de respuestas HTTP:** [`docs/standards/api-responses.md`](../../docs/standards/api-responses.md)
- **Estándar de access tokens y sesiones:** [`docs/standards/jwt-and-sessions.md`](../../docs/standards/jwt-and-sessions.md)

## Resumen de fases de implementación

1. **Fase 1 — completada:** Scaffold React + TypeScript + Vite, Tailwind CSS v4, primitivas `shadcn/ui`, tipos de envoltura HTTP y utilidades de dinero exacto (`decimal.js`) en `src/app/shared/`.
2. **Fase 2 — completada:** Cliente HTTP con interceptores (`Authorization`, `Idempotency-Key`, `X-Request-Id` y reintentos automáticos ante `409 PROJECTION_NOT_READY`), store de sesión multi-sistema (`Zustand`), módulo `auth/login` y shell `modules/layout.tsx`.
3. **Fase 3 — completada:** Módulo de Compras (`modules/purchases/orders`) — listado paginado, alta/edición maestro-detalle de hasta 100 líneas, snapshots históricos, transiciones `submit`/`cancel` e historial auditable.
4. **Fase 4 — completada en frontend:** Módulo de Inventario (`modules/inventory/products`) — catálogo paginado, creación de productos, ajustes de stock con motivo saneado, desactivación lógica con `expectedVersion` y selector buscable para las líneas de Compras. El backend de Inventory aún debe implementar los endpoints para habilitar el recorrido extremo a extremo.
5. **Fase 5 — completada en frontend:** Módulo de Administración (`modules/administration`) — alta y actualización de usuarios, matriz de asignaciones `{ system, role }`, desactivación protegida, control optimista y configuración de TTL por sistema. Auth ya expone `GET /api/auth/users`; su integración en la tabla del frontend queda como mejora posterior.
6. **Fase 6 — completada:** Suite Vitest/Testing Library/MSW, recorridos Playwright de autenticación, RBAC y flujo Inventario → Compras, `Dockerfile` multi-stage sin root, Nginx Edge, perfiles Compose y job frontend en GitHub Actions.
