# Purchases: contrato de implementación

Las respuestas JSON de negocio siguen el [estándar común](../standards/api-responses.md).

Estado: base Django REST Framework ejecutable con configuración, salud, OpenAPI, Docker y pruebas. El dominio, PostgreSQL y los consumidores de usuarios/productos siguen planificados. En el MVP registra órdenes a proveedores; recepción, reservas y modificaciones automáticas de stock quedan fuera del alcance. Por ello no produce eventos de stock ni requiere sagas.

Configurar los routers DRF con `trailing_slash=False`: las rutas del contrato son exactas y el Gateway no sigue redirects para añadir barras.

## Datos e invariantes

`PurchaseOrders`: UUID, requesterId del JWT, supplierName obligatorio (1–200 caracteres), currency `MXN`, status DRAFT/SUBMITTED/CANCELLED, version y timestamps UTC. `PurchaseOrderLines`: UUID, orderId, productId, skuSnapshot, nameSnapshot, unit `UNIT`, quantity entero >0 y unitPrice decimal exacto positivo (18,2), recibido como string. Rechazar más de dos decimales y desbordamientos; total calculado en servidor con Decimal. Producto repetido en la orden: 400. Al menos una línea; máximo 100.

Capturar sku/nombre/unidad al crear o editar líneas desde ProductsProjection; al enviar congelar esos valores y precios. Las consultas históricas usan esos snapshots, aunque cambie el catálogo. Datos actuales de proyecciones pueden mostrarse aparte, sin sustituir históricos.

Transiciones: DRAFT→SUBMITTED; DRAFT o SUBMITTED→CANCELLED. SUBMITTED/CANCELLED no admiten edición de líneas. CANCELLED es terminal. Toda escritura usa expectedVersion, actor y auditoría, sin perder actualizaciones concurrentes. ADMIN puede operar cualquier orden; PURCHASES_AGENT solo sus propias órdenes; el API no acepta requesterId arbitrario.

POST de creación requiere `Idempotency-Key` UUID. Guardar `(requesterId,key)`, hash canónico del request y respuesta en la misma transacción de la orden con unicidad. Repetir el mismo request devuelve el resultado original; cambiar el cuerpo con la misma key devuelve 409. Conservar las keys al menos durante la vida de la orden. Validaciones rechazadas antes del commit no consumen la key. Submit/cancel verifican versión y estado; repetir una transición ya aplicada con la misma key devuelve su respuesta original.

## Proyecciones y HTTP

Usuarios: grupo `purchases.auth-users.v1`. Productos: grupo `purchases.inventory-products.v1`. Nunca compartir grupo con Inventory. Inbox y proyección se guardan atómicamente antes del offset. Ver [contratos](../../contracts/events) y [recuperación](../architecture/event-driven-communication.md).

Verificar JWT completo de PURCHASES y RBAC. Usuario conocido inactivo: 403. Producto conocido inactivo: 409 PRODUCT_INACTIVE. UUID válido ausente en proyección: `409 PROJECTION_NOT_READY`, Retry-After 2; sin HTTP a propietarios y sin afirmar que nunca existió. SKU y stock de la proyección no garantizan disponibilidad presente, y no se usan para descontar existencias.

| Endpoint | Comportamiento |
| --- | --- |
| `GET /api/purchases/orders` | Listado paginado; agente solo sus órdenes |
| `POST /api/purchases/orders` | Crear DRAFT con Idempotency-Key; 201 |
| `PUT /api/purchases/orders/{id}` | Editar DRAFT con expectedVersion |
| `POST /api/purchases/orders/{id}/submit` | Congelar orden DRAFT; key y versión obligatorias |
| `POST /api/purchases/orders/{id}/cancel` | Cancelar; key y versión obligatorias |
| `GET /api/purchases/openapi.json` | Schema DRF de desarrollo, paths completos y server `/` |

Aceptación: migraciones, permisos/propiedad, dinero exacto, snapshots históricos, transiciones, conflictos concurrentes, idempotencia incluso con solicitudes simultáneas, proyecciones atrasadas/inactivas, duplicados/DLQ/bootstrap y ausencia de llamadas HTTP a dominios. README propio con instalación, migraciones, configuración y pruebas.
