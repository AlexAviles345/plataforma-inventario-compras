# Plan de Implementación por Fases — Purchases Service

Este documento detalla el plan técnico y secuencial para implementar el microservicio de compras (`purchases-service`) en **Django 6.0 / Django REST Framework 3.17 / Python 3.14**, alineado con los contratos oficiales del repositorio:

- [Contrato de Purchases](../../../docs/services/purchases-service.md)
- [Modelo de datos planificado](../../../docs/architecture/data-model.md#purchases-postgresql)
- [Entrega de eventos y proyecciones](../../../docs/architecture/event-driven-communication.md)
- [Estándar de respuestas HTTP](../../../docs/standards/api-responses.md)
- [Estándar de access tokens y sesiones](../../../docs/standards/jwt-and-sessions.md)
- [Reglas comunes de implementación](../../../docs/standards/guidelines.md)

## Alcance del MVP para Compras

- Registra órdenes de compra a proveedores (`purchase_orders`) con sus líneas (`purchase_order_lines`), historial auditable (`purchase_order_history`) y llaves de idempotencia (`idempotency_keys`).
- Mantiene dos proyecciones locales de solo lectura alimentadas por Kafka (`user_projections` y `product_projections`) deduplicadas mediante `inbox_events`.
- **Fuera del MVP:** recepción de mercancía, reservas, pagos, facturas, movimientos automáticos de stock o publicación de eventos desde Compras (no requiere `outbox_events` ni sagas).
- **Aislamiento:** prohibido realizar consultas HTTP o conexiones SQL hacia `auth-service` o `inventory-service`.

---

## Fase 1: Configuración de PostgreSQL y Modelo de Datos (Migraciones)

**Objetivo:** Configurar la persistencia en PostgreSQL (`postgres-purchases`, puerto local `5433`) y materializar el esquema físico completo mediante migraciones versionadas de Django, respetando el orden: tablas propietarias → tablas técnicas y proyecciones → restricciones e índices.

### 1.1 Dependencias y configuración de base de datos
- Incorporar `psycopg[binary]` en `requirements.txt`.
- Configurar `DATABASES` en `purchases_service/settings.py` apuntando a PostgreSQL mediante variables de entorno (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_CONN_MAX_AGE`), con valores por defecto locales compatibles con `docker-compose.example.yml` (`127.0.0.1:5433`, `purchases_db`, `purchases_user`, `purchases_password`).
- Documentar las variables de entorno en `.env.example`.

### 1.2 Tablas propietarias del dominio (`orders`)
1. **`purchase_orders`**:
   - `id`: `UUIDField` (PK).
   - `requester_id`: `UUIDField` (`sub` del creador desde el JWT; sin FK hacia la proyección).
   - `supplier_name`: `CharField(max_length=200)` obligatorio (1–200 caracteres tras trim).
   - `currency`: `CharField(max_length=3)` restringido a `'MXN'`.
   - `status`: `CharField(max_length=16)` restringido a `'DRAFT'`, `'SUBMITTED'`, `'CANCELLED'`.
   - `total_amount`: `DecimalField(max_digits=18, decimal_places=2)` con `CHECK (total_amount > 0)`.
   - `version`: `BigIntegerField(default=1)` con `CHECK (version >= 1)`.
   - `last_modified_by`: `UUIDField` (actor del último cambio).
   - `submitted_at`: `DateTimeField(null=True, blank=True)` UTC.
   - `cancelled_at`: `DateTimeField(null=True, blank=True)` UTC.
   - `created_at`, `updated_at`: `DateTimeField` UTC obligatorios.
   - **Checks de estado y fechas:**
     - En `DRAFT`: `submitted_at IS NULL` y `cancelled_at IS NULL`.
     - En `SUBMITTED`: `submitted_at IS NOT NULL` y `cancelled_at IS NULL`.
     - En `CANCELLED`: `cancelled_at IS NOT NULL` (`submitted_at` puede ser nulo si se canceló desde `DRAFT` o conservar su fecha si fue enviada antes).
   - **Índices:** `(requester_id, -created_at, id)` y `(status, -created_at, id)`.

2. **`purchase_order_lines`**:
   - `id`: `UUIDField` (PK).
   - `order`: `ForeignKey(PurchaseOrder, on_delete=PROTECT/RESTRICT, db_column="order_id")`.
   - `position`: `SmallIntegerField` con `CHECK (position >= 1 AND position <= 100)`.
   - `product_id`: `UUIDField` (ID de Inventory; sin FK a `product_projections`).
   - `sku_snapshot`: `CharField(max_length=64)`.
   - `name_snapshot`: `CharField(max_length=200)`.
   - `unit`: `CharField(max_length=16)` con `CHECK (unit = 'UNIT')`.
   - `quantity`: `IntegerField` con `CHECK (quantity > 0)`.
   - `unit_price`: `DecimalField(max_digits=18, decimal_places=2)` con `CHECK (unit_price > 0)`.
   - `line_total`: `DecimalField(max_digits=18, decimal_places=2)` con `CHECK (line_total > 0)`.
   - `created_at`, `updated_at`: `DateTimeField` UTC.
   - **Restricciones únicas:** `UNIQUE (order_id, position)` y `UNIQUE (order_id, product_id)`.

3. **`idempotency_keys`**:
   - `id`: `UUIDField` (PK interna).
   - `requester_id`: `UUIDField`.
   - `idempotency_key`: `UUIDField`.
   - `operation`: `CharField(max_length=24)` con `CHECK` en `('CREATE_ORDER', 'SUBMIT_ORDER', 'CANCEL_ORDER')`.
   - `order`: `ForeignKey(PurchaseOrder, on_delete=RESTRICT, db_column="order_id")`.
   - `request_hash`: `CharField(max_length=64)` (SHA-256 hexadecimal del request canónico).
   - `response_status`: `SmallIntegerField`.
   - `response_body`: `JSONField`.
   - `created_at`: `DateTimeField` UTC.
   - **Restricciones e índices:** `UNIQUE (requester_id, idempotency_key)` e índice `(order_id, created_at)`.

4. **`purchase_order_history`**:
   - `id`: `UUIDField` (PK).
   - `order`: `ForeignKey(PurchaseOrder, on_delete=RESTRICT, db_column="order_id")`.
   - `order_version`: `BigIntegerField` (`>= 1`).
   - `action`: `CharField(max_length=24)` con `CHECK` en `('CREATED', 'UPDATED', 'SUBMITTED', 'CANCELLED')`.
   - `from_status`: `CharField(max_length=16, null=True, blank=True)` (nulo en `CREATED`).
   - `to_status`: `CharField(max_length=16)` (`DRAFT`, `SUBMITTED`, `CANCELLED`).
   - `actor_user_id`: `UUIDField`.
   - `request_id`: `UUIDField`.
   - `changes`: `JSONField` (resumen saneado sin credenciales ni tokens).
   - `created_at`: `DateTimeField` UTC.
   - **Restricciones e índices:** `UNIQUE (order_id, order_version)` e índice `(order_id, created_at)`.

### 1.3 Tablas técnicas y proyecciones locales (`projections` / `orders`)
5. **`user_projections`**:
   - `user_id`: `UUIDField` (PK).
   - `email`: `CharField(max_length=254)` con índice no único.
   - `display_name`: `CharField(max_length=200)`.
   - `active`: `BooleanField`.
   - `assignments`: `JSONField` (snapshot de asignaciones `{system, role}`).
   - `entity_version`: `BigIntegerField` (`>= 1`).
   - `source_event_id`: `UUIDField`.
   - `source_event_at`: `DateTimeField` UTC.
   - `projected_at`: `DateTimeField` UTC.

6. **`product_projections`**:
   - `product_id`: `UUIDField` (PK).
   - `sku`: `CharField(max_length=64)` con índice no único.
   - `name`: `CharField(max_length=200)`.
   - `unit`: `CharField(max_length=16)` con `CHECK (unit = 'UNIT')`.
   - `stock_on_hand`: `BigIntegerField` con `CHECK (stock_on_hand >= 0)`.
   - `active`: `BooleanField`.
   - `created_by`: `UUIDField`.
   - `updated_by`: `UUIDField`.
   - `entity_version`: `BigIntegerField` (`>= 1`).
   - `source_event_id`: `UUIDField`.
   - `source_event_at`: `DateTimeField` UTC.
   - `projected_at`: `DateTimeField` UTC.

7. **`inbox_events`**:
   - `event_id`: `UUIDField` (PK).
   - `consumer_group`: `CharField(max_length=128)`.
   - `topic`: `CharField(max_length=255)`.
   - `partition_number`: `IntegerField` con `CHECK (partition_number >= 0)`.
   - `offset_value`: `BigIntegerField` con `CHECK (offset_value >= 0)`.
   - `aggregate_id`: `UUIDField`.
   - `event_type`: `CharField(max_length=64)`.
   - `schema_version`: `SmallIntegerField` (`>= 1`).
   - `entity_version`: `BigIntegerField` (`>= 1`).
   - `correlation_id`: `UUIDField`.
   - `event_occurred_at`: `DateTimeField` UTC.
   - `payload_hash`: `CharField(max_length=64)` (SHA-256).
   - `outcome`: `CharField(max_length=24)` con `CHECK` en `('APPLIED', 'IGNORED_STALE')`.
   - `processed_at`: `DateTimeField` UTC.
   - **Restricción única:** `UNIQUE (consumer_group, topic, partition_number, offset_value)`.

### 1.4 Criterios de aceptación de Fase 1
- `python manage.py makemigrations --check --dry-run` no reporta cambios pendientes.
- Las migraciones aplican limpiamente y crean todas las tablas, checks, llaves únicas e índices especificados.
- Pruebas automatizadas verifican las restricciones de integridad e invariantes del modelo de datos.

---

## Fase 2: Estándar HTTP, Trazabilidad, Autenticación JWT y RBAC Local

**Objetivo:** Garantizar que toda petición bajo `/api/purchases/**` cumpla el formato estándar de respuestas y errores, propague `X-Request-Id` y valide de forma autónoma el access token JWT y la proyección local del usuario.

### 2.1 Envoltura de respuestas y manejo global de errores
- Respuestas exitosas: `{ "error": false, "statusCode": <int>, "message": "<str>", "data": <obj|list|null>, "meta": <opcional> }`.
- Respuestas de error: `{ "error": true, "statusCode": <int>, "code": "<UPPER_SNAKE_CASE>", "message": "<str>", "source": "purchases", "timestamp": "<ISO-8601-UTC>", "details": [...] }`.
- Middleware para leer o generar `X-Request-Id` (UUID) y devolverlo siempre en el header de respuesta.

### 2.2 Validación de Access Token JWT (`HS256`)
- Validar firma con `JWT_SECRET` (>= 32 bytes), algoritmo exclusivamente `HS256` y header `typ: "JWT"`.
- Validar `iss == "techdistribution-auth"`, `aud == "techdistribution-api"`, `iat` (no > 30s en el futuro), `exp > now`, `exp > iat`, y `exp - iat <= JWT_MAX_TTL_SECONDS` (default 900, máx 3600).
- Validar `sub` (UUID), `email`, `role` (`ADMIN` o `PURCHASES_AGENT`) y exigir `system == "PURCHASES"`. Rechazar tokens de `INVENTORY` (`403 FORBIDDEN`) o tokens inválidos/expirados (`401 INVALID_TOKEN`).

### 2.3 Autorización y consulta de `user_projections`
- Comprobar la existencia de `sub` en `user_projections`:
  - Si no existe: responder `409 PROJECTION_NOT_READY` con header `Retry-After: 2`.
  - Si `active == False` o no posee asignación válida para `PURCHASES`: responder `403 FORBIDDEN`.
- Reglas de propiedad:
  - `ADMIN`: acceso total a todas las órdenes.
  - `PURCHASES_AGENT`: solo puede consultar, editar, enviar o cancelar órdenes donde `requester_id == sub`.

---

## Fase 3: Consumidores Kafka, Inbox Transaccional, Proyecciones y DLQ

**Objetivo:** Sincronizar asíncronamente `user_projections` y `product_projections` desde Apache Kafka con entrega idempotente, control de versiones monotónico, aislamiento en DLQ y soporte de reconstrucción.

### 3.1 Grupos de consumo y tópicos
- Usuarios: tópico `auth.users.events`, grupo `purchases.auth-users.v1`, DLQ `purchases.auth-users.dlq`.
- Productos: tópico `inventory.products.events`, grupo `purchases.inventory-products.v1`, DLQ `purchases.inventory-products.dlq`.
- `enable.auto.commit=false`.

### 3.2 Validación y aplicación atómica
- Validar JSON Schema Draft 2020-12 (`event-envelope.schema.json`, `user-event.schema.json`, `product-event.schema.json`), formatos UUID/email/date-time y coincidencia de `aggregateId` con `data.userId`/`data.productId` y con la key de Kafka.
- En una sola transacción local:
  1. Insertar registro en `inbox_events` (si ya existe el `event_id`, ignorar sin duplicar efectos).
  2. Hacer upsert en la proyección correspondiente únicamente si `entityVersion` entrante > `entity_version` almacenada (`outcome = 'APPLIED'`); en caso contrario, conservar la proyección intacta y registrar `outcome = 'IGNORED_STALE'`.
- Confirmar el offset en Kafka solo tras el commit exitoso en PostgreSQL.

### 3.3 Reintentos, DLQ y Bootstrap
- Fallos transitorios: hasta 5 reintentos con backoff exponencial (1, 2, 4, 8, 16 segundos + jitter).
- Errores permanentes de schema o reintentos agotados: publicar en la DLQ correspondiente y confirmar el offset original únicamente tras el acknowledgement de la DLQ.
- Comando administrativo de importación de snapshots consistentes + watermark para reconstrucción posterior al periodo de retención.

---

## Fase 4: Dominio de Órdenes, Snapshots, Concurrencia e Idempotencia

**Objetivo:** Implementar los endpoints de negocio de órdenes de compra, garantizando precisión decimal, inmutabilidad histórica, control optimista de versiones e idempotencia transaccional.

### 4.1 Reglas de negocio e invariantes
- `supplierName`: obligatorio, 1–200 caracteres tras trim. `currency`: siempre `MXN`.
- Líneas: mínimo 1, máximo 100 por orden; sin `productId` repetidos en la misma orden (`400 VALIDATION_ERROR`).
- Precios y totales: `unitPrice` como string decimal positivo con hasta 2 decimales; `lineTotal = quantity * unitPrice` y `totalAmount = sum(lineTotal)` calculados en servidor con `Decimal`.
- Validación de productos contra `product_projections`:
  - UUID ausente en proyección → `409 PROJECTION_NOT_READY` (`Retry-After: 2`).
  - Producto con `active == False` → `409 PRODUCT_INACTIVE`.
- Captura de `sku_snapshot`, `name_snapshot` y `unit` desde `product_projections` al crear o editar en `DRAFT`; congelamiento definitivo al pasar a `SUBMITTED`.
- Transiciones: `DRAFT -> SUBMITTED` y `DRAFT | SUBMITTED -> CANCELLED`. `CANCELLED` es terminal; `SUBMITTED` y `CANCELLED` no admiten edición de líneas.
- Concurrencia: toda modificación o transición exige `expectedVersion` y valida contra `version` actual con bloqueo/actualización condicional; si difiere, responde `409 VERSION_CONFLICT`.
- Idempotencia: header `Idempotency-Key` (UUID) obligatorio en `POST /api/purchases/orders`, `POST .../submit` y `POST .../cancel`. Se almacena `(requester_id, idempotency_key)` con `request_hash` SHA-256, `response_status` y `response_body` en la misma transacción. Reintentar el mismo request devuelve la respuesta original; cambiar el payload u operación con la misma key devuelve `409 IDEMPOTENCY_CONFLICT`.

### 4.2 Endpoints HTTP (`trailing_slash=False`)
| Método y Ruta | Descripción |
| --- | --- |
| `GET /api/purchases/orders` | Listado paginado de órdenes (`ADMIN` todas; `PURCHASES_AGENT` solo propias) |
| `POST /api/purchases/orders` | Creación de orden `DRAFT` con `Idempotency-Key` (`201 Created`) |
| `PUT /api/purchases/orders/{id}` | Edición de orden `DRAFT` con `expectedVersion` (`200 OK`) |
| `POST /api/purchases/orders/{id}/submit` | Envío y congelamiento de orden `DRAFT` con `Idempotency-Key` y `expectedVersion` (`200 OK`) |
| `POST /api/purchases/orders/{id}/cancel` | Cancelación de orden `DRAFT` o `SUBMITTED` con `Idempotency-Key` y `expectedVersion` (`200 OK`) |
| `GET /api/purchases/openapi.json` | Esquema OpenAPI en desarrollo con `servers: [{"url": "/"}]` |

---

## Fase 5: Pruebas de Aceptación, Calidad y Documentación Final

**Objetivo:** Verificar todos los criterios de aceptación del servicio y dejar lista la integración con el resto de la plataforma.

- Pruebas unitarias y de integración cubriendo:
  - Validación JWT y rechazo cruzado de tokens (`INVENTORY` vs `PURCHASES`).
  - RBAC y aislamiento de órdenes por `requester_id`.
  - Exactitud decimal (`Decimal(18,2)`), límites de líneas (1–100) y rechazo de productos duplicados.
  - Permanencia intacta de snapshots históricos (`sku_snapshot`, `name_snapshot`, `unit_price`) tras actualizaciones posteriores en `product_projections`.
  - Idempotencia en creación, envío y cancelación (incluyendo solicitudes concurrentes y detección de `409 IDEMPOTENCY_CONFLICT`).
  - Control optimista de versiones (`409 VERSION_CONFLICT`).
  - Estados de proyección (`409 PROJECTION_NOT_READY` con `Retry-After: 2`, `409 PRODUCT_INACTIVE`, `403 FORBIDDEN`).
  - Consumidores Kafka: deduplicación por `inbox_events`, descarte de versiones antiguas (`IGNORED_STALE`), envío a DLQ y reconstrucción desde snapshot.
- Validación de calidad: `ruff check .`, `ruff format --check .`, `python manage.py check`, `python manage.py makemigrations --check --dry-run`, `python -Wa manage.py test` y construcción de imagen Docker.
