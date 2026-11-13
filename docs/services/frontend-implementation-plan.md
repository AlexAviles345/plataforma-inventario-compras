# Plan de Implementación por Fases — Frontend Web (SPA Modular)

Este documento detalla la arquitectura modular mejorada, las decisiones tecnológicas y el plan técnico secuencial por fases para implementar el frontend unificado de **TechDistribution** (`apps/frontend`) en **React 19 + TypeScript 5 + Vite 6 + Tailwind CSS v4 + shadcn/ui**, alineado con los contratos oficiales del repositorio:

- [Contrato de Frontend Web](./frontend-web.md)
- [Contrato del API Gateway](./api-gateway.md)
- [Contrato de Auth Service](./auth-service.md)
- [Contrato de Inventory Service](./inventory-service.md)
- [Contrato de Purchases Service](./purchases-service.md)
- [Estándar de respuestas HTTP](../standards/api-responses.md)
- [Estándar de access tokens y sesiones](../standards/jwt-and-sessions.md)
- [Capa Edge con Nginx](../infrastructure/nginx-edge.md)

---

## 1. Decisiones Tecnológicas (Los 6 Pilares del Frontend)

### 1.1 Core y Bundler (SPA Modular con React + TypeScript + Vite)
- **React 19 + TypeScript 5 (modo `strict: true`) + Vite 6** sobre **Node 24**.
- Sin servidor SSR intermedio: en desarrollo Vite enruta `/api` hacia `http://localhost:3000` (API Gateway) y en producción genera artefactos estáticos inmutables (`dist/`) servidos directamente por Nginx en `/`.
- **Enrutamiento declarativo:** **React Router v7** (o TanStack Router) con carga diferida (`React.lazy` + `Suspense`) por módulo y *guards* de seguridad por `system` (`INVENTORY`, `PURCHASES`) y `role` (`ADMIN`, `INVENTORY_MANAGER`, `PURCHASES_AGENT`).

### 1.2 Sistema de Diseño e Interfaz (`shadcn/ui` + Tailwind CSS)
- **Tailwind CSS v4** con variables CSS semánticas (soporte nativo para tema claro/oscuro y paleta empresarial sobria estilo *Linear / Vercel*).
- **`shadcn/ui` (basado en Radix UI + Lucide Icons):** componentes accesibles alojados en `src/app/(shared)/components/ui/` (`Button`, `Input`, `Dialog`, `Sheet`, `Table`, `Badge`, `Command`, `Popover`, `Select`, `Tabs`, `Tooltip`, `DropdownMenu`, `Skeleton`).
- **Notificaciones (`Sonner`):** toasts estructurados que muestran mensajes de negocio, el código de error (`code`), detalles por campo (`details[]`) y el `X-Request-Id` copiable para auditoría.

### 1.3 Estado de Servidor, Caché y Comunicación con el API Gateway
- **TanStack Query v5 (React Query):** gestión de caché, estados de carga, paginación sincronizada con URL (`page`, `limit`), invalidación selectiva tras mutaciones y política automática de reintentos ante `409 PROJECTION_NOT_READY` respetando el header `Retry-After` (`2s`).
- **Cliente HTTP (`Axios` o `ky` tipado) con Interceptores:**
  1. **Interceptor de Autenticación:** inyecta `Authorization: Bearer <accessToken>` seleccionando el token del sistema requerido por el módulo (`INVENTORY` o `PURCHASES`).
  2. **Interceptor de Idempotencia:** adjunta `Idempotency-Key: <uuid>` en `POST /api/purchases/orders`, `submit` y `cancel`, reutilizando la misma clave si se reintenta la misma operación por fallo de red.
  3. **Interceptor de Desempaquetado y Errores:** valida la envoltura `{ error, statusCode, message, data, meta }`, extrae `X-Request-Id` del header de respuesta y transforma errores HTTP (`400`, `401`, `403`, `404`, `409`, `413`, `429`, `502`, `504`) en una clase tipada `GatewayApiError`.
- **Estado de Sesión en Memoria (`Zustand`):** store ligero (`useAuthSessionStore`) que mantiene los tokens por sistema (`INVENTORY` y `PURCHASES`), los claims decodificados (`sub`, `email`, `role`, `system`, `exp`) y el sistema activo en la interfaz.

### 1.4 Formularios Dinámicos, Dinero Exacto y Tablas de Datos
- **React Hook Form + Zod:** validación declarativa en cliente antes de enviar al Gateway y mapeo automático de errores `400 VALIDATION_ERROR` (`details[].field`, como `lines[0].unitPrice`) hacia el input exacto.
- **`decimal.js` para Dinero Exacto (`MXN`):** cálculo sin pérdida de precisión de `lineTotal = quantity * unitPrice` y `totalAmount` en el formulario maestro-detalle de órdenes (hasta 100 líneas), serializando `unitPrice` siempre como `string` con dos decimales (`"1250.50"`).
- **TanStack Table v8:** tablas empresariales reutilizables (`DataTable.tsx`) conectadas al objeto `meta: { page, limit, total, totalPages }` del estándar HTTP.

### 1.5 Arquitectura Modular por Grupos de Dominio (Inspirada en Next App Router, Optimizada para Vite SPA)
Tomando como base la estructura de referencia (`src/app/(auth)`, `src/app/(modules)`, `src/app/(shared)` y submódulos con `components/`, `config/`, `hooks/`, `services/`, `types/`, `index.ts`, `page.tsx`), se aplican las siguientes **mejoras arquitectónicas**:
1. **Unificación de la capa compartida en `src/app/(shared)/`:** se elimina la duplicación de carpetas `components/`, `services/` y `types/` en la raíz de `src/`. Todo código transversal vive en `src/app/(shared)/` y se importa mediante el alias `@shared/*`.
2. **Aislamiento estricto entre módulos (`@modules/*`):** cada módulo de dominio (`administration`, `inventory`, `purchases`, `dashboard`) contiene sus propios `components/`, `config/`, `hooks/`, `schemas/`, `services/`, `types/`, `index.ts` y `page.tsx`. Un módulo nunca importa archivos internos de otro módulo; solo consume `@shared/*`.
3. **Almacenamiento temporal de borradores (`draftStorage`):** al igual que el patrón `registrationDraftStorage.ts`, el formulario de creación de órdenes incluye persistencia local opcional de borrador en sesión junto con su `Idempotency-Key` activa hasta que el servidor confirma el `201 Created`.

### 1.6 Calidad, Pruebas y Despliegue (CI/CD y Nginx Edge)
- **ESLint 9 + Prettier + TypeScript typecheck (`tsc --noEmit`)**.
- **Vitest + React Testing Library + MSW (Mock Service Worker)** para pruebas unitarias y de integración de módulos sin depender de backends encendidos.
- **Playwright** para pruebas E2E del flujo completo en el Hito 6 (*Login → Usuario → Producto → Proyección → Orden*).
- **Dockerfile multi-stage** (Node 24 build → runtime sin privilegios) listo para integrarse detrás de Nginx.

---

## 2. Árbol Completo de Arquitectura del Frontend (`apps/frontend`)

```text
apps/frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── app/
│   │   ├── (auth)/                                     # Grupo de rutas públicas de autenticación
│   │   │   ├── login/
│   │   │   │   ├── components/
│   │   │   │   │   ├── LoginFormCard.tsx               # Formulario con selector de sistema (INVENTORY / PURCHASES)
│   │   │   │   │   └── SystemBadgeSelector.tsx
│   │   │   │   ├── config/
│   │   │   │   │   └── login-systems.config.ts
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useLoginForm.ts
│   │   │   │   ├── schemas/
│   │   │   │   │   └── login.schema.ts                 # Validación Zod de { email, password, system }
│   │   │   │   ├── services/
│   │   │   │   │   └── auth-login.service.ts           # POST /api/auth/login
│   │   │   │   ├── types/
│   │   │   │   │   └── auth-login.types.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx                              # Layout limpio centrado para pantallas de acceso
│   │   │
│   │   ├── (modules)/                                  # Grupo de rutas protegidas del ERP / Backoffice
│   │   │   ├── dashboard/                              # Resumen operativo y estado de tokens por sistema
│   │   │   │   ├── components/
│   │   │   │   │   ├── ActiveSystemSessionCard.tsx
│   │   │   │   │   └── QuickModuleAccessGrid.tsx
│   │   │   │   ├── index.ts
│   │   │   │   └── page.tsx
│   │   │   │
│   │   │   ├── administration/                         # Dominio Auth (exclusivo rol ADMIN)
│   │   │   │   ├── users/                              # Gestión de usuarios y asignaciones { system, role }
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── UserCreateDialog.tsx
│   │   │   │   │   │   ├── UserEditSheet.tsx           # Edición con expectedVersion y active toggle
│   │   │   │   │   │   ├── UserSystemAssignmentsField.tsx
│   │   │   │   │   │   └── UsersTable.tsx
│   │   │   │   │   ├── config/
│   │   │   │   │   │   └── user-roles.config.ts
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   ├── useCreateUser.ts
│   │   │   │   │   │   └── useUpdateUser.ts
│   │   │   │   │   ├── schemas/
│   │   │   │   │   │   └── user-form.schema.ts
│   │   │   │   │   ├── services/
│   │   │   │   │   │   └── users-admin.service.ts      # POST /api/auth/users, PUT /api/auth/users/{id}
│   │   │   │   │   ├── types/
│   │   │   │   │   │   └── users-admin.types.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── page.tsx
│   │   │   │   └── systems/                            # Configuración de sistemas y TTL de tokens
│   │   │   │       ├── components/
│   │   │   │       │   ├── SystemTtlEditDialog.tsx     # PUT /api/auth/systems/{code} con expectedVersion
│   │   │   │       │   └── SystemsCatalogCards.tsx
│   │   │   │       ├── hooks/
│   │   │   │       │   ├── useSystemsList.ts
│   │   │   │       │   └── useUpdateSystemTtl.ts
│   │   │   │       ├── services/
│   │   │   │       │   └── systems-admin.service.ts    # GET /api/auth/systems, PUT /api/auth/systems/{code}
│   │   │   │       ├── types/
│   │   │   │       │   └── systems-admin.types.ts
│   │   │   │       ├── index.ts
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   ├── inventory/                              # Dominio Inventory (token INVENTORY: ADMIN | INVENTORY_MANAGER)
│   │   │   │   └── products/
│   │   │   │       ├── components/
│   │   │   │       │   ├── ProductCreateDialog.tsx
│   │   │   │       │   ├── ProductDetailPanel.tsx
│   │   │   │       │   ├── ProductEditSheet.tsx        # Edición y ajuste de stock con expectedVersion y reason
│   │   │   │       │   ├── ProductsFilterBar.tsx
│   │   │   │       │   └── ProductsTable.tsx
│   │   │   │       ├── config/
│   │   │   │       │   └── products-columns.config.ts
│   │   │   │       ├── hooks/
│   │   │   │       │   ├── useCreateProduct.ts
│   │   │   │       │   ├── useProductsList.ts
│   │   │   │       │   └── useUpdateProduct.ts
│   │   │   │       ├── schemas/
│   │   │   │       │   └── product-form.schema.ts
│   │   │   │       ├── services/
│   │   │   │       │   └── products.service.ts         # GET/POST /api/inventory/products, PUT .../{id}
│   │   │   │       ├── types/
│   │   │   │       │   └── products.types.ts
│   │   │   │       ├── index.ts
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   ├── purchases/                              # Dominio Purchases (token PURCHASES: ADMIN | PURCHASES_AGENT)
│   │   │   │   └── orders/
│   │   │   │       ├── components/
│   │   │   │       │   ├── OrderCancelDialog.tsx       # POST .../cancel con Idempotency-Key, expectedVersion y reason
│   │   │   │       │   ├── OrderDetailPanel.tsx        # Detalle con snapshots históricos vs currentCatalog
│   │   │   │       │   ├── OrderHistorySheet.tsx       # Drawer lateral con timeline de purchase_order_history
│   │   │   │       │   ├── OrderLinesFieldArray.tsx    # Editor dinámico 1..100 líneas con cálculo decimal.js
│   │   │   │       │   ├── OrderSubmitConfirmDialog.tsx# POST .../submit con Idempotency-Key y expectedVersion
│   │   │   │       │   ├── OrdersSummaryCards.tsx
│   │   │   │       │   └── OrdersTable.tsx
│   │   │   │       ├── config/
│   │   │   │       │   └── orders-filters.config.ts
│   │   │   │       ├── hooks/
│   │   │   │       │   ├── orderDraftStorage.ts        # Persistencia local de borrador e Idempotency-Key activa
│   │   │   │       │   ├── useOrderDetail.ts
│   │   │   │       │   ├── useOrderForm.ts
│   │   │   │       │   ├── useOrderHistory.ts
│   │   │   │       │   ├── useOrderMutations.ts        # create, update (PUT), submit y cancel
│   │   │   │       │   └── useOrdersList.ts
│   │   │   │       ├── new/
│   │   │   │       │   └── page.tsx                    # Vista dedicada de alta / edición maestro-detalle
│   │   │   │       ├── schemas/
│   │   │   │       │   └── order-form.schema.ts        # Validación Zod de 1..100 líneas, sin duplicados y escala <= 2
│   │   │   │       ├── services/
│   │   │   │       │   └── purchase-orders.service.ts  # Endpoints /api/purchases/orders/**
│   │   │   │       ├── types/
│   │   │   │       │   └── purchase-orders.types.ts
│   │   │   │       ├── index.ts
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   └── layout.tsx                              # Shell autenticado con DynamicSidebar, Header y Breadcrumb
│   │   │
│   │   ├── (shared)/                                   # Capa transversal única (@shared/*)
│   │   │   ├── components/
│   │   │   │   ├── cards/
│   │   │   │   │   └── SummaryStatCard.tsx
│   │   │   │   ├── data-display/
│   │   │   │   │   ├── ConfirmActionDialog.tsx
│   │   │   │   │   ├── DataTable.tsx                   # TanStack Table + paginación conectada a meta
│   │   │   │   │   ├── ProjectionSyncBanner.tsx        # Aviso en vivo ante 409 PROJECTION_NOT_READY (Retry-After)
│   │   │   │   │   ├── StatusBadge.tsx
│   │   │   │   │   └── VersionConflictAlert.tsx        # Banner de resolución ante 409 VERSION_CONFLICT
│   │   │   │   ├── inputs/
│   │   │   │   │   ├── DecimalMoneyInput.tsx           # Input controlado para montos exactos (18,2)
│   │   │   │   │   └── SearchableSelect.tsx
│   │   │   │   ├── layout/
│   │   │   │   │   ├── BreadcrumbNav.tsx
│   │   │   │   │   ├── DynamicSidebar.tsx              # Menú filtrado por rol y sistema activo
│   │   │   │   │   ├── ErrorPage404.tsx
│   │   │   │   │   ├── GlobalLoader.tsx
│   │   │   │   │   ├── Header.tsx                      # Incluye SystemSwitcher y estado del JWT
│   │   │   │   │   └── SystemSwitcher.tsx
│   │   │   │   ├── ui/                                 # Primitivas oficiales de shadcn/ui
│   │   │   │   └── index.ts
│   │   │   ├── config/
│   │   │   │   ├── env.config.ts
│   │   │   │   ├── navigation.config.ts
│   │   │   │   └── query-client.config.ts              # Configuración global de TanStack Query y retry 409
│   │   │   ├── contexts/
│   │   │   │   └── ThemeProvider.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useDebounce.ts
│   │   │   │   ├── useIdempotencyKey.ts
│   │   │   │   ├── usePaginationParams.ts
│   │   │   │   └── useSystemGuard.ts
│   │   │   ├── services/
│   │   │   │   ├── api-error.normalizer.ts
│   │   │   │   └── http-client.ts                      # Instancia HTTP con interceptores de JWT, X-Request-Id y sobre
│   │   │   ├── stores/
│   │   │   │   └── auth-session.store.ts               # Store Zustand con tokens por sistema y decodificación segura
│   │   │   ├── types/
│   │   │   │   ├── api-envelope.types.ts               # ApiSuccessEnvelope<T>, ApiErrorEnvelope, PaginationMeta
│   │   │   │   ├── auth-claims.types.ts
│   │   │   │   └── error-codes.types.ts
│   │   │   ├── utils/
│   │   │   │   ├── cn.ts
│   │   │   │   ├── date-utc.util.ts
│   │   │   │   └── decimal-money.util.ts               # Helpers exactos con decimal.js
│   │   │   └── index.ts
│   │   │
│   │   ├── router/
│   │   │   ├── AppRouter.tsx
│   │   │   ├── ProtectedRouteGuard.tsx
│   │   │   └── SystemTokenGuard.tsx
│   │   ├── error.tsx                                   # ErrorBoundary global de la aplicación
│   │   ├── globals.css                                 # Directivas Tailwind CSS v4 y variables de tema shadcn/ui
│   │   └── not-found.tsx
│   └── main.tsx
├── .env.example
├── components.json                                     # Configuración CLI de shadcn/ui
├── Dockerfile
├── eslint.config.js
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Planificación Detallada por Fases

### Fase 1: Scaffold Vite + TypeScript, Tailwind CSS v4, `shadcn/ui` y Arquitectura Base (`(shared)`)
**Objetivo:** Inicializar `apps/frontend` como paquete compatible con el supervisor de la raíz (`npm run dev`), configurar los alias de importación (`@shared/*`, `@modules/*`, `@auth/*`), instalar Tailwind CSS v4 + primitivas base de `shadcn/ui` y construir los tipos y utilidades transversales.

- **Entregables:**
  1. `package.json`, `tsconfig.json`, `vite.config.ts` (con proxy `/api` $\rightarrow$ `http://localhost:3000` en desarrollo y puerto local `5173`), `.env.example` y configuración de ESLint/Prettier.
  2. Inicialización de `shadcn/ui` en `src/app/(shared)/components/ui/` (`button`, `input`, `label`, `card`, `badge`, `dialog`, `sheet`, `table`, `select`, `command`, `popover`, `sonner`, `skeleton`, `separator`, `dropdown-menu`, `tooltip`).
  3. Utilidades transversales en `src/app/(shared)/utils/`:
     - `decimal-money.util.ts` con `decimal.js` para cálculo exacto de importes `(18, 2)`, validación de escala máxima de 2 decimales y formateo en `MXN`.
     - `date-utc.util.ts` para formatear timestamps ISO 8601 UTC provenientes de los tres microservicios.
  4. Contratos TypeScript en `src/app/(shared)/types/` para el sobre estándar (`ApiSuccessResponse<T>`, `ApiErrorResponse`, `FieldErrorDetail`, `PaginationMeta`) y catálogo completo de códigos de error (`VALIDATION_ERROR`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `PROJECTION_NOT_READY`, `PRODUCT_INACTIVE`, `ORDER_STATE_CONFLICT`).

---

### Fase 2: Cliente HTTP, Interceptores, Store de Sesión Multi-Sistema y Shell de Navegación (`(auth)` + Layouts)
**Objetivo:** Implementar la capa de red conectada al API Gateway, el manejo de tokens JWT por sistema (`INVENTORY` y `PURCHASES`), la política global de reintentos ante proyecciones en vuelo y el flujo de Login + Layout protegido.

- **Entregables:**
  1. `src/app/(shared)/stores/auth-session.store.ts` (Zustand):
     - Almacena en memoria los access tokens emitidos para `INVENTORY` y `PURCHASES`, decodifica sus claims (`sub`, `email`, `role`, `system`, `iat`, `exp`), detecta expiración y expone selectores de permisos (`isAdmin`, `canAccessInventory`, `canAccessPurchases`).
  2. `src/app/(shared)/services/http-client.ts` y `query-client.config.ts`:
     - Adjunta el `Bearer` token del sistema requerido por cada prefijo (`/api/inventory/*` usa el token `INVENTORY`; `/api/purchases/*` usa el token `PURCHASES`; `/api/auth/*` usa el token administrativo activo).
     - Desempaqueta automáticamente la respuesta exitosa y adjunta `requestId` (`X-Request-Id`).
     - Configura en **TanStack Query** el reintento automático cuando una consulta o mutación segura recibe `409 PROJECTION_NOT_READY`, esperando el número de segundos indicado en el header `Retry-After` (por defecto `2s`, hasta 4 intentos) y activando el componente `ProjectionSyncBanner.tsx`.
  3. Módulo `(auth)/login/`:
     - Pantalla de inicio de sesión con selección de sistema destino (`INVENTORY` o `PURCHASES`), conectada a `POST /api/auth/login`.
     - Modo de asistencia para desarrollo local (solo en `import.meta.env.DEV`): permite pegar un token generado con `python manage.py generate_dev_token` para probar módulos individuales aunque `auth-service` esté apagado.
  4. Shell principal `(modules)/layout.tsx`:
     - `DynamicSidebar.tsx`, `Header.tsx`, `SystemSwitcher.tsx` (permite cambiar entre `INVENTORY` y `PURCHASES` o solicitar credenciales del segundo sistema sin perder la sesión del primero), `BreadcrumbNav.tsx` y `ProtectedRouteGuard.tsx`.

---

### Fase 3: Módulo de Compras (`(modules)/purchases/orders`) — Órdenes, Líneas, Snapshots, Concurrencia e Idempotencia
**Objetivo:** Construir el módulo completo de órdenes de compra aprovechando que `purchases-service` ya tiene sus 5 fases implementadas en el backend.

- **Entregables:**
  1. **Listado y Filtros (`OrdersTable.tsx`, `useOrdersList.ts`):**
     - Consume `GET /api/purchases/orders` con paginación `page`/`limit`, filtro por `status` (`DRAFT`, `SUBMITTED`, `CANCELLED`) y filtro por `requesterId` (visible para `ADMIN`).
     - Tarjetas de resumen (`OrdersSummaryCards.tsx`) y badges de estado semánticos.
  2. **Formulario Maestro-Detalle de Creación y Edición (`orders/new/page.tsx`, `OrderLinesFieldArray.tsx`, `useOrderForm.ts`):**
     - Validación con **React Hook Form + Zod**: `supplierName` (1–200 caracteres), entre 1 y 100 líneas, bloqueo de `productId` repetidos en la misma orden (`DUPLICATE_PRODUCT_LINE`), `quantity` entero positivo y `unitPrice` decimal exacto con máximo 2 decimales.
     - Cálculo en tiempo real de `lineTotal` y `totalAmount` usando `decimal.js`.
     - Generación y persistencia de `Idempotency-Key` (`orderDraftStorage.ts` + `useIdempotencyKey.ts`) para `POST /api/purchases/orders`: si ocurre un timeout de red, el reintento usa la misma key; si el servidor responde `400 VALIDATION_ERROR` o `409 PRODUCT_INACTIVE`, permite corregir sin bloquear la key.
     - Edición de órdenes `DRAFT` mediante `PUT /api/purchases/orders/{id}` enviando `expectedVersion`.
  3. **Detalle, Snapshots Históricos y Acciones de Transición (`OrderDetailPanel.tsx`, `OrderSubmitConfirmDialog.tsx`, `OrderCancelDialog.tsx`):**
     - Muestra los valores históricos de cada línea (`skuSnapshot`, `nameSnapshot`, `unit`, `unitPrice`, `lineTotal`) y, cuando `currentCatalog` reporta que el producto cambió de nombre/SKU o fue desactivado en Inventario, despliega un indicador comparativo sin alterar los datos históricos de la orden.
     - Acción **Enviar y congelar (`POST /api/purchases/orders/{id}/submit`)** y acción **Cancelar (`POST /api/purchases/orders/{id}/cancel`)** con `Idempotency-Key` UUID, `expectedVersion` y motivo de cancelación opcional (`reason`).
     - Manejo visual de `409 VERSION_CONFLICT` (`VersionConflictAlert.tsx`) y `409 ORDER_STATE_CONFLICT`.
  4. **Historial Auditable (`OrderHistorySheet.tsx`, `useOrderHistory.ts`):**
     - Panel deslizable (`Sheet`) que consulta `GET /api/purchases/orders/{id}/history` y representa en una línea de tiempo cada versión confirmada (`CREATED`, `UPDATED`, `SUBMITTED`, `CANCELLED`), actor, `requestId` y resumen de cambios.

---

### Fase 4: Módulo de Inventario (`(modules)/inventory/products`) — Catálogo, Stock y Control Optimista
**Objetivo:** Implementar la interfaz de gestión del catálogo de productos y correcciones explícitas de existencias conectada a `/api/inventory/products`.

- **Entregables:**
  1. **Catálogo Paginado (`ProductsTable.tsx`, `ProductsFilterBar.tsx`, `useProductsList.ts`):**
     - Consume `GET /api/inventory/products` con token `INVENTORY`, mostrando `sku`, `name`, `unit` (`UNIT`), `stockOnHand`, estado `active`, `version` y metadatos de autoría (`createdBy`, `updatedBy`).
  2. **Alta de Producto (`ProductCreateDialog.tsx`, `useCreateProduct.ts`):**
     - Consume `POST /api/inventory/products` validando unicidad de SKU (`409` en caso de duplicado), nombre (1–200 caracteres tras trim) y stock inicial (`>= 0`).
  3. **Edición, Desactivación Lógica y Ajuste de Stock (`ProductEditSheet.tsx`, `useUpdateProduct.ts`):**
     - Consume `PUT /api/inventory/products/{id}` enviando `expectedVersion`, motivo administrativo saneado (`reason` de 1 a 500 caracteres cuando cambia el stock) y switch de desactivación lógica (`active: false`, recordando al usuario que los productos referenciados por compras nunca se eliminan físicamente).
  4. **Integración con el Selector de Productos de Compras:**
     - Provee un selector buscable de productos activos para facilitar la captura de líneas en órdenes cuando el usuario cuenta con acceso al catálogo o caché local.

---

### Fase 5: Módulo de Administración (`(modules)/administration`) — Usuarios, Asignaciones y Sistemas
**Objetivo:** Implementar las pantallas exclusivas para el rol `ADMIN` conectadas a `/api/auth/users` y `/api/auth/systems`.

- **Entregables:**
  1. **Gestión de Usuarios y Asignaciones (`users/page.tsx`, `UserCreateDialog.tsx`, `UserEditSheet.tsx`):**
     - Creación de usuarios (`POST /api/auth/users`) con `email`, `displayName`, contraseña inicial y matriz de asignaciones `{ system, role }` (máximo una por sistema: `INVENTORY` con `ADMIN | INVENTORY_MANAGER` y `PURCHASES` con `ADMIN | PURCHASES_AGENT`).
     - Actualización (`PUT /api/auth/users/{id}`) con `expectedVersion`, edición de asignaciones y desactivación (`active: false`), mostrando el error de protección si se intenta desactivar al último administrador activo.
  2. **Configuración de Sistemas y Vigencia JWT (`systems/page.tsx`, `SystemsCatalogCards.tsx`, `SystemTtlEditDialog.tsx`):**
     - Consulta `GET /api/auth/systems` y permite actualizar la duración de futuros access tokens (`PUT /api/auth/systems/{code}` con `expectedVersion`, respetando el límite `<= JWT_MAX_TTL_SECONDS`).

---

### Fase 6: Pruebas Automatizadas (Vitest + MSW + Playwright), Dockerización e Integración con Nginx Edge
**Objetivo:** Asegurar la calidad del frontend en CI/CD, empaquetarlo en Docker y validar el recorrido completo a través de Nginx y el API Gateway.

- **Entregables:**
  1. **Suite de Pruebas con Vitest + Testing Library + MSW:**
     - Pruebas de cálculo monetario exacto con `decimal.js` y validación de formularios de hasta 100 líneas.
     - Pruebas de interceptores HTTP: inyección de `Idempotency-Key`, manejo de `409 VERSION_CONFLICT` y reintento automático ante `409 PROJECTION_NOT_READY` (`Retry-After: 2`).
     - Pruebas de aislamiento RBAC en rutas y menús para `ADMIN`, `INVENTORY_MANAGER` y `PURCHASES_AGENT`.
  2. **Pruebas End-to-End con Playwright:**
     - Flujo automatizado: login por sistema, alta de producto, espera de sincronización de proyección en Compras, creación de orden `DRAFT`, edición `PUT`, envío `submit`, verificación de inmutabilidad de snapshot histórico tras editar producto y cancelación `cancel`.
  3. **Empaquetado Docker y CI:**
     - `apps/frontend/Dockerfile` multi-stage y job `frontend` en `.github/workflows/ci.yml` (`npm ci`, `npm run format:check`, `npm run lint`, `npm run build`, `npm test`).
     - Integración con el perfil `frontend` y `edge` (Nginx) descrito en [`docs/infrastructure/nginx-edge.md`](../infrastructure/nginx-edge.md).
