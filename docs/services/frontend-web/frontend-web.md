# Frontend Web: contrato de implementación

Aplicación web empresarial unificada (SPA monolítica modular) en **React 19 + TypeScript 5 + Vite 6**, estilizada con **Tailwind CSS v4 + shadcn/ui (Radix UI)**, que consume exclusivamente el [API Gateway](../api-gateway/api-gateway.md) bajo `/api/**` y cumple el [estándar de respuestas HTTP](../../standards/api-responses.md), el [contrato de access tokens y sesiones](../../standards/jwt-and-sessions.md) y las [reglas comunes](../../standards/guidelines.md).

Estado: **Fases 1 a 6 implementadas** en `apps/frontend`; incluye el scaffold, sistema de diseño, cliente HTTP, access token en memoria, sesión renovable, login/logout, guards RBAC, Compras, Inventario, Administración, pruebas automatizadas y empaquetado Docker/Nginx. En desarrollo se ejecuta sobre Node 24 con recarga en caliente y proxy local hacia `http://localhost:3000`; el perfil edge sirve la aplicación en `http://localhost:8088` y conserva `/api/**` detrás del Gateway.

> **Disponibilidad de Inventario:** la interfaz de la Fase 4 consume el contrato documentado `GET/POST /api/inventory/products` y `PUT /api/inventory/products/{id}` a través del Gateway. `inventory-service` conserva por ahora únicamente su scaffold ejecutable, por lo que esas operaciones no estarán disponibles extremo a extremo hasta implementar el dominio y los controladores correspondientes en el backend.

> **Disponibilidad de Administración:** `auth-service` implementa `GET/POST/PUT /api/auth/users`. La interfaz de la Fase 5 consume el catálogo paginado y las operaciones de escritura de usuarios y asignaciones a través del Gateway.

## Alcance y principios arquitectónicos

- **Monolito modular (no microfrontends):** una sola aplicación desplegable dentro de `apps/frontend` que agrupa los módulos de **Autenticación y Administración (`auth`)**, **Inventario (`inventory`)** y **Compras (`purchases`)**, compartiendo sistema de diseño, cliente HTTP, manejo de errores y estado de sesión.
- **Sin llamadas directas a microservicios:** el navegador jamás invoca los puertos internos de Auth (`3001`), Inventory (`8081`) ni Purchases (`8000`); toda comunicación pasa por `/api/auth/*`, `/api/inventory/*` y `/api/purchases/*` a través del Gateway (`3000` en desarrollo o el mismo origen `/` detrás de Nginx).
- **Rutas exactas sin barra final:** todas las peticiones hacia `/api/**` respetan las rutas exactas sin `trailing slash`, dado que el Gateway no sigue redirecciones internas.

## Sesión, tokens por sistema y RBAC en cliente

El contrato de autenticación emite un `accessToken` JWT por cada sistema asignado al usuario (`system: "INVENTORY"` o `system: "PURCHASES"`) con `role` singular (`ADMIN`, `INVENTORY_MANAGER` o `PURCHASES_AGENT`):

1. **Almacenamiento seguro en memoria:** los access tokens devueltos tras el login único se conservan en memoria dentro del store de sesión (Zustand) indexados por sistema (`sessions.INVENTORY`, `sessions.PURCHASES`), evitando exponer credenciales sensibles en URLs, logs o eventos.
2. **Carga dinámica de módulos y RBAC por sesión:**
   - Al iniciar sesión con `{ email, password }`, Auth emite automáticamente en `tokens` todos los access tokens para los sistemas autorizados del usuario.
   - Un `INVENTORY_MANAGER` recibe token de `INVENTORY` y ve en la barra lateral únicamente el módulo de Inventario.
   - Un `PURCHASES_AGENT` recibe token de `PURCHASES` y ve únicamente el módulo de Compras.
   - Un `ADMIN` recibe tokens para sus sistemas asignados (p. ej. `INVENTORY` y `PURCHASES`) y accede en la misma barra lateral dinámica a Inventario, Compras y Administración (`/administration/*`), seleccionando el cliente HTTP el token correspondiente según la ruta consumida.
3. **Renovación y expiración:** el refresh token opaco permanece exclusivamente en la cookie `td_refresh` `HttpOnly`; la SPA sólo lee `td_csrf`. Al recargar ejecuta `POST /api/auth/refresh` antes de mostrar rutas protegidas y rota nuevamente 30 segundos antes de `exp`, restaurando los tokens vigentes de todos los sistemas asignados. Los access tokens viven únicamente en el store en memoria y nunca se persisten en Web Storage.
4. **Logout:** la confirmación ejecuta `POST /api/auth/logout`; sólo después de que Auth revoca la familia y limpia cookies se elimina el estado local y se vuelve a `/login`.

## Invariantes de datos, concurrencia, idempotencia y proyecciones

- **Envoltura única (`ApiResponse<T>` / `ApiErrorResponse`):** el cliente HTTP central desempaqueta `data` y `meta` en respuestas `2xx`, captura el header `X-Request-Id` para soporte/diagnóstico y normaliza cualquier error estructurado (`code`, `message`, `source`, `details[]`).
- **Errores de validación por campo (`details[]`):** las rutas JSON devueltas por los servicios (por ejemplo `lines[0].unitPrice` con `INVALID_DECIMAL_SCALE`) se mapean directamente a los campos correspondientes de **React Hook Form** o se muestran en alertas accionables.
- **Dinero exacto y cantidades:**
  - Cantidades de productos y líneas de compra: enteros positivos (`>= 1`; `stockOnHand >= 0`).
  - Precios e importes (`unitPrice`, `lineTotal`, `totalAmount`): operados en cliente con **`decimal.js`** y enviados siempre como cadena decimal exacta con dos decimales (`"1250.50"`), nunca como `number` flotante binario.
- **Control optimista (`expectedVersion`):** toda edición (`PUT /api/auth/users/{id}`, `PUT /api/inventory/products/{id}`, `PUT /api/purchases/orders/{id}`) y transición (`submit`, `cancel`) envía la `version` leída del recurso como `expectedVersion`. Ante `409 VERSION_CONFLICT`, la UI informa que el registro fue modificado por otro usuario y ofrece recargar el estado más reciente sin sobrescribir cambios a ciegas.
- **Idempotencia (`Idempotency-Key`):** los comandos `POST /api/purchases/orders`, `POST /api/purchases/orders/{id}/submit` y `POST /api/purchases/orders/{id}/cancel` generan un UUID v4 por intención de usuario y lo conservan mientras el intento siga pendiente de respuesta, permitiendo reintentar de forma segura ante fallos de red sin duplicar órdenes. Si el formulario cambia, se genera una nueva key.
- **Proyecciones asíncronas (`409 PROJECTION_NOT_READY`):** cuando un servicio responde `409` con `code: "PROJECTION_NOT_READY"` y header `Retry-After` (típicamente `2` segundos), **TanStack Query** ejecuta reintentos automáticos respetando `Retry-After` y muestra un indicador visual no bloqueante (_"Sincronizando catálogo/usuario..."_) en lugar de tratarlo como un error fatal o un falso `404`.
- **Snapshots históricos en Compras:** las vistas de detalle e historial de órdenes muestran siempre `skuSnapshot`, `nameSnapshot`, `unit`, `unitPrice` y `lineTotal` congelados en la línea; si `currentCatalog` difiere (por cambios posteriores en Inventario o desactivación del producto), se exhibe como badge informativo separado sin sustituir los valores históricos.

## Matriz de módulos, rutas de UI y endpoints consumidos

| Módulo / Ruta UI             | Roles permitidos                     | Sistema JWT                           | Endpoints en API Gateway                                                                                                    |
| ---------------------------- | ------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/login`                     | Público                              | Sin token previo (emite bundle por permisos) | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`                                                    |
| `/dashboard`                 | Todos los autenticados               | Todos los sistemas asignados               | Resumen de sesión, accesos por rol/permisos y estado rápido                                                                 |
| `/administration/users`      | `ADMIN`                              | Token válido (`ADMIN`)                | `GET /api/auth/users`, `POST /api/auth/users`, `PUT /api/auth/users/{id}`                                                   |
| `/inventory/products`        | `ADMIN`, `INVENTORY_MANAGER`         | `INVENTORY`                           | `GET /api/inventory/products`, `POST /api/inventory/products`, `PUT /api/inventory/products/{id}`                           |
| `/purchases/orders`          | `ADMIN`, `PURCHASES_AGENT`           | `PURCHASES`                           | `GET /api/purchases/orders` (paginado + filtros)                                                                            |
| `/purchases/orders/new`      | `ADMIN`, `PURCHASES_AGENT`           | `PURCHASES`                           | `POST /api/purchases/orders` (`Idempotency-Key`)                                                                            |
| `/purchases/orders/:orderId` | `ADMIN`, `PURCHASES_AGENT` (propias) | `PURCHASES`                           | `GET /api/purchases/orders/{id}`, `PUT /api/purchases/orders/{id}`, `POST .../submit`, `POST .../cancel`, `GET .../history` |

## Criterios de aceptación

1. **Integración con supervisor y CI:** `apps/frontend/package.json` expone `dev`, `build`, `lint`, `format:check`, `test` y `test:e2e`; `npm run dev` en la raíz levanta el frontend junto con los backends.
2. **Cumplimiento estricto de contratos:** cero llamadas directas fuera del Gateway, manejo verificado de la envoltura HTTP, paginación `meta`, `X-Request-Id`, `expectedVersion`, `Idempotency-Key` y `409 PROJECTION_NOT_READY`.
3. **Aislamiento RBAC y propiedad:** ocultamiento y bloqueo de rutas según `role` y `system`; un `PURCHASES_AGENT` solo opera sus órdenes y un `INVENTORY_MANAGER` no accede a Compras ni Administración.
4. **Precisión monetaria e inmutabilidad histórica:** cálculos exactos con `decimal.js` y preservación visual de snapshots históricos frente a cambios posteriores del catálogo.
5. **Contenedor y Nginx Edge:** `Dockerfile` multi-stage reproducible sin privilegios root y entrega de `/` tras Nginx en el recorrido `npm run dev:edge`.

Las pruebas Playwright interceptan los contratos HTTP en el navegador para aislar el frontend. Esto valida sus recorridos sin presentar los dobles como evidencia de integración con Auth o Inventory reales. La validación con servicios y bases reales corresponde al pipeline de integración; Inventory continúa pendiente de implementación.
