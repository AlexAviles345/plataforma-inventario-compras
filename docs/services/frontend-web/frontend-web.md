# Frontend Web: contrato de implementación

Aplicación web empresarial unificada (SPA monolítica modular) en **React 19 + TypeScript 5 + Vite 6**, estilizada con **Tailwind CSS v4 + shadcn/ui (Radix UI)**, que consume exclusivamente el [API Gateway](../api-gateway/api-gateway.md) bajo `/api/**` y cumple el [estándar de respuestas HTTP](../../standards/api-responses.md), el [contrato de access tokens y sesiones](../../standards/jwt-and-sessions.md) y las [reglas comunes](../../standards/guidelines.md).

Estado: planificación general y [plan detallado de implementación por fases](./frontend-implementation-plan.md) definidos en documentación. En desarrollo se ejecuta sobre Node 24 con recarga en caliente y proxy local hacia `http://localhost:3000`; en despliegues accesibles se sirve detrás de [Nginx como capa edge](../../infrastructure/nginx-edge.md) en `/`.

## Alcance y principios arquitectónicos

- **Monolito modular (no microfrontends):** una sola aplicación desplegable dentro de `apps/frontend` que agrupa los módulos de **Autenticación y Administración (`auth`)**, **Inventario (`inventory`)** y **Compras (`purchases`)**, compartiendo sistema de diseño, cliente HTTP, manejo de errores y estado de sesión.
- **Sin llamadas directas a microservicios:** el navegador jamás invoca los puertos internos de Auth (`3001`), Inventory (`8081`) ni Purchases (`8000`); toda comunicación pasa por `/api/auth/*`, `/api/inventory/*` y `/api/purchases/*` a través del Gateway (`3000` en desarrollo o el mismo origen `/` detrás de Nginx).
- **Rutas exactas sin barra final:** todas las peticiones hacia `/api/**` respetan las rutas exactas sin `trailing slash`, dado que el Gateway no sigue redirecciones internas.

## Sesión, tokens por sistema y RBAC en cliente

El contrato de autenticación emite un `accessToken` JWT por sistema destino (`system: "INVENTORY"` o `system: "PURCHASES"`) con `role` singular (`ADMIN`, `INVENTORY_MANAGER` o `PURCHASES_AGENT`):

1. **Almacenamiento seguro en memoria:** los access tokens se conservan en memoria dentro del store de sesión (Zustand) indexados por sistema (`tokens.INVENTORY`, `tokens.PURCHASES`), evitando exponer credenciales sensibles en URLs, logs o eventos.
2. **Selección y cambio de sistema (`System Switcher`):**
   - Un `INVENTORY_MANAGER` opera en el módulo de Inventario (`system: "INVENTORY"`).
   - Un `PURCHASES_AGENT` opera en el módulo de Compras (`system: "PURCHASES"`).
   - Un `ADMIN` puede autenticarse en cualquiera de los dos sistemas (o mantener tokens activos para ambos en su sesión en memoria) y gestionar además usuarios y sistemas en `/administration/*`.
3. **Renovación y expiración en el MVP:** dado que `refresh` y `logout` están reservados fuera del MVP actual, el frontend verifica la vigencia (`exp`) del token y, ante expiración o respuesta `401 AUTHENTICATION_REQUIRED` / `401 INVALID_TOKEN`, limpia el estado del sistema afectado y redirige al flujo de login conservando la ruta de retorno.

## Invariantes de datos, concurrencia, idempotencia y proyecciones

- **Envoltura única (`ApiResponse<T>` / `ApiErrorResponse`):** el cliente HTTP central desempaqueta `data` y `meta` en respuestas `2xx`, captura el header `X-Request-Id` para soporte/diagnóstico y normaliza cualquier error estructurado (`code`, `message`, `source`, `details[]`).
- **Errores de validación por campo (`details[]`):** las rutas JSON devueltas por los servicios (por ejemplo `lines[0].unitPrice` con `INVALID_DECIMAL_SCALE`) se mapean directamente a los campos correspondientes de **React Hook Form** o se muestran en alertas accionables.
- **Dinero exacto y cantidades:**
  - Cantidades de productos y líneas de compra: enteros positivos (`>= 1`; `stockOnHand >= 0`).
  - Precios e importes (`unitPrice`, `lineTotal`, `totalAmount`): operados en cliente con **`decimal.js`** y enviados siempre como cadena decimal exacta con dos decimales (`"1250.50"`), nunca como `number` flotante binario.
- **Control optimista (`expectedVersion`):** toda edición (`PUT /api/auth/users/{id}`, `PUT /api/auth/systems/{code}`, `PUT /api/inventory/products/{id}`, `PUT /api/purchases/orders/{id}`) y transición (`submit`, `cancel`) envía la `version` leída del recurso como `expectedVersion`. Ante `409 VERSION_CONFLICT`, la UI informa que el registro fue modificado por otro usuario y ofrece recargar el estado más reciente sin sobrescribir cambios a ciegas.
- **Idempotencia (`Idempotency-Key`):** los comandos `POST /api/purchases/orders`, `POST /api/purchases/orders/{id}/submit` y `POST /api/purchases/orders/{id}/cancel` generan un UUID v4 por intención de usuario y lo conservan mientras el intento siga pendiente de respuesta, permitiendo reintentar de forma segura ante fallos de red sin duplicar órdenes. Si el formulario cambia, se genera una nueva key.
- **Proyecciones asíncronas (`409 PROJECTION_NOT_READY`):** cuando un servicio responde `409` con `code: "PROJECTION_NOT_READY"` y header `Retry-After` (típicamente `2` segundos), **TanStack Query** ejecuta reintentos automáticos respetando `Retry-After` y muestra un indicador visual no bloqueante (*"Sincronizando catálogo/usuario..."*) en lugar de tratarlo como un error fatal o un falso `404`.
- **Snapshots históricos en Compras:** las vistas de detalle e historial de órdenes muestran siempre `skuSnapshot`, `nameSnapshot`, `unit`, `unitPrice` y `lineTotal` congelados en la línea; si `currentCatalog` difiere (por cambios posteriores en Inventario o desactivación del producto), se exhibe como badge informativo separado sin sustituir los valores históricos.

## Matriz de módulos, rutas de UI y endpoints consumidos

| Módulo / Ruta UI | Roles permitidos | Sistema JWT | Endpoints en API Gateway |
| --- | --- | --- | --- |
| `/login` | Público | Selección (`INVENTORY` o `PURCHASES`) | `POST /api/auth/login` |
| `/dashboard` | Todos los autenticados | Activo en sesión | Resumen de sesión, accesos por rol y estado rápido |
| `/administration/users` | `ADMIN` | Token válido (`ADMIN`) | `POST /api/auth/users`, `PUT /api/auth/users/{id}` |
| `/administration/systems` | `ADMIN` | Token válido (`ADMIN`) | `GET /api/auth/systems`, `PUT /api/auth/systems/{code}` |
| `/inventory/products` | `ADMIN`, `INVENTORY_MANAGER` | `INVENTORY` | `GET /api/inventory/products`, `POST /api/inventory/products`, `PUT /api/inventory/products/{id}` |
| `/purchases/orders` | `ADMIN`, `PURCHASES_AGENT` | `PURCHASES` | `GET /api/purchases/orders` (paginado + filtros) |
| `/purchases/orders/new` | `ADMIN`, `PURCHASES_AGENT` | `PURCHASES` | `POST /api/purchases/orders` (`Idempotency-Key`) |
| `/purchases/orders/:orderId` | `ADMIN`, `PURCHASES_AGENT` (propias) | `PURCHASES` | `GET /api/purchases/orders/{id}`, `PUT /api/purchases/orders/{id}`, `POST .../submit`, `POST .../cancel`, `GET .../history` |

## Criterios de aceptación

1. **Integración con supervisor y CI:** `apps/frontend/package.json` expone `dev`, `build`, `lint`, `format:check`, `test` y `test:e2e`; `npm run dev` en la raíz levanta el frontend junto con los backends.
2. **Cumplimiento estricto de contratos:** cero llamadas directas fuera del Gateway, manejo verificado de la envoltura HTTP, paginación `meta`, `X-Request-Id`, `expectedVersion`, `Idempotency-Key` y `409 PROJECTION_NOT_READY`.
3. **Aislamiento RBAC y propiedad:** ocultamiento y bloqueo de rutas según `role` y `system`; un `PURCHASES_AGENT` solo opera sus órdenes y un `INVENTORY_MANAGER` no accede a Compras ni Administración.
4. **Precisión monetaria e inmutabilidad histórica:** cálculos exactos con `decimal.js` y preservación visual de snapshots históricos frente a cambios posteriores del catálogo.
5. **Contenedor y Nginx Edge:** `Dockerfile` multi-stage reproducible sin privilegios root y entrega de `/` tras Nginx en el recorrido `npm run dev:edge`.

