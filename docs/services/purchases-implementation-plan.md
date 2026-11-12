# Plan de Implementación por Fases — Purchases Service

Este documento detalla la arquitectura interna y el plan técnico secuencial para implementar el microservicio de compras (`purchases-service`) en **Django 6.0 / Django REST Framework 3.17 / Python 3.14**, alineado con los contratos oficiales del repositorio:

- [Contrato de Purchases](./purchases-service.md)
- [Modelo de datos planificado](../architecture/data-model.md#purchases-postgresql)
- [Entrega de eventos y proyecciones](../architecture/event-driven-communication.md)
- [Estándar de respuestas HTTP](../standards/api-responses.md)
- [Estándar de access tokens y sesiones](../standards/jwt-and-sessions.md)
- [Reglas comunes de implementación](../standards/guidelines.md)

---

## Arquitectura Modular del Servicio (Django)

Para mantener responsabilidades desacopladas y evitar archivos monolíticos, `purchases-service` se organiza en un paquete transversal `core/` y aplicaciones de dominio separadas (`orders/`, `projections/`, `health/`), donde cada capa (`models/`, `serializers/`, `services/`, `views/`, `urls/`, `consumers/`) es un paquete de Python con módulos especializados:

```text
apps/backend/purchases-service/
├── core/                                   # Utilidades y políticas transversales (Fase 2)
│   ├── __init__.py
│   ├── api_response.py                     # Envoltura estándar (error, statusCode, message, data, meta)
│   ├── audit_context.py                    # X-Request-Id y contexto del actor autenticado
│   ├── authentication.py                   # Validación JWT HS256 independiente (system: PURCHASES)
│   ├── exception_handler.py                # Handler global de errores con source="purchases"
│   └── permissions.py                      # RBAC (ADMIN vs PURCHASES_AGENT) y estado de usuario
│
├── orders/                                 # Dominio propietario de órdenes de compra
│   ├── migrations/
│   │   ├── __init__.py
│   │   └── 0001_initial.py                 # Tablas propietarias (purchase_orders, lines, idempotency, history)
│   ├── models/
│   │   ├── __init__.py
│   │   ├── choices.py                      # Enums/TextChoices del dominio de órdenes
│   │   ├── purchase_order.py               # Modelo PurchaseOrder (purchase_orders)
│   │   ├── purchase_order_line.py          # Modelo PurchaseOrderLine (purchase_order_lines)
│   │   ├── idempotency_key.py              # Modelo IdempotencyKey (idempotency_keys)
│   │   └── purchase_order_history.py       # Modelo PurchaseOrderHistory (purchase_order_history)
│   ├── serializers/                        # Serializadores por operación (Fase 4)
│   ├── services/                           # Lógica transaccional, snapshots e idempotencia (Fase 4)
│   ├── urls/                               # Rutas bajo /api/purchases/orders (Fase 4)
│   ├── views/                              # Vistas DRF desacopladas (Fase 4)
│   ├── apps.py
│   └── tests.py
│
├── projections/                            # Proyecciones locales de Kafka e Inbox técnico
│   ├── migrations/
│   │   ├── __init__.py
│   │   └── 0001_initial.py                 # Depende de orders.0001_initial; crea proyecciones e inbox
│   ├── models/
│   │   ├── __init__.py
│   │   ├── choices.py                      # Enums/TextChoices de inbox y proyecciones
│   │   ├── user_projection.py              # Modelo UserProjection (user_projections)
│   │   ├── product_projection.py           # Modelo ProductProjection (product_projections)
│   │   └── inbox_event.py                  # Modelo InboxEvent (inbox_events)
│   ├── consumers/                          # Grupos Kafka purchases.auth-users.v1 e inventory-products.v1 (Fase 3)
│   ├── services/                           # Aplicación atómica de snapshots, DLQ y bootstrap (Fase 3)
│   ├── apps.py
│   └── tests.py
│
├── health/                                 # Endpoints operativos (/health/live, /health/ready)
└── purchases_service/                      # Configuración global (settings, urls, wsgi, asgi)
```

---

## Alcance del MVP para Compras

- Registra órdenes de compra a proveedores (`purchase_orders`) con sus líneas (`purchase_order_lines`), historial auditable (`purchase_order_history`) y llaves de idempotencia (`idempotency_keys`).
- Mantiene dos proyecciones locales de solo lectura alimentadas por Kafka (`user_projections` y `product_projections`) deduplicadas mediante `inbox_events`.
- **Fuera del MVP:** recepción de mercancía, reservas, pagos, facturas, movimientos automáticos de stock o publicación de eventos desde Compras (no requiere `outbox_events` ni sagas).
- **Aislamiento:** prohibido realizar consultas HTTP o conexiones SQL hacia `auth-service` o `inventory-service`.

---

## Fase 1: Configuración de PostgreSQL, Estructura Modular y Modelo de Datos — [COMPLETADA]

**Objetivo:** Configurar la persistencia en PostgreSQL (`postgres-purchases`, puerto local `5433`), establecer la estructura modular (`core/`, `orders/`, `projections/`) y materializar el esquema físico completo mediante migraciones versionadas de Django, respetando el orden: tablas propietarias (`orders`) → tablas técnicas y proyecciones (`projections`) → restricciones e índices.

### 1.1 Dependencias y configuración de base de datos
- Incorporar `psycopg[binary]` en `requirements.txt`.
- Configurar `DATABASES` en `purchases_service/settings.py` apuntando a PostgreSQL mediante variables de entorno (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_CONN_MAX_AGE`), con valores por defecto locales compatibles con `docker-compose.example.yml` (`127.0.0.1:5433`, `purchases_db`, `purchases_user`, `purchases_password`).
- Documentar las variables de entorno en `.env.example`.

### 1.2 Tablas propietarias del dominio (`orders/models/`)
1. **`purchase_orders` (`orders/models/purchase_order.py`)**:
   - `id` (UUID PK), `requester_id` (UUID), `supplier_name` (1–200 chars), `currency` (`MXN`), `status` (`DRAFT`, `SUBMITTED`, `CANCELLED`), `total_amount` (`numeric(18,2)` > 0), `version` (`bigint` >= 1), `last_modified_by` (UUID), `submitted_at`, `cancelled_at`, `created_at`, `updated_at`.
   - Checks de fechas según estado e índices `(requester_id, -created_at, id)` y `(status, -created_at, id)`.
2. **`purchase_order_lines` (`orders/models/purchase_order_line.py`)**:
   - `id` (UUID PK), `order` (FK `RESTRICT`), `position` (1–100), `product_id` (UUID sin FK a proyección), `sku_snapshot`, `name_snapshot`, `unit` (`UNIT`), `quantity` (> 0), `unit_price` (`numeric(18,2)` > 0), `line_total` (`numeric(18,2)` > 0), `created_at`, `updated_at`.
   - Restricciones `UNIQUE (order_id, position)` y `UNIQUE (order_id, product_id)`.
3. **`idempotency_keys` (`orders/models/idempotency_key.py`)**:
   - `id` (UUID PK), `requester_id`, `idempotency_key`, `operation` (`CREATE_ORDER`, `SUBMIT_ORDER`, `CANCEL_ORDER`), `order` (FK `RESTRICT`), `request_hash` (`char(64)` SHA-256), `response_status`, `response_body` (`jsonb`), `created_at`.
   - `UNIQUE (requester_id, idempotency_key)` e índice `(order_id, created_at)`.
4. **`purchase_order_history` (`orders/models/purchase_order_history.py`)**:
   - `id` (UUID PK), `order` (FK `RESTRICT`), `order_version` (>= 1), `action` (`CREATED`, `UPDATED`, `SUBMITTED`, `CANCELLED`), `from_status`, `to_status`, `actor_user_id`, `request_id`, `changes` (`jsonb`), `created_at`.
   - `UNIQUE (order_id, order_version)` e índice `(order_id, created_at)`.

### 1.3 Tablas técnicas y proyecciones locales (`projections/models/`)
5. **`user_projections` (`projections/models/user_projection.py`)**:
   - `user_id` (UUID PK), `email` (indexado no único), `display_name`, `active`, `assignments` (`jsonb`), `entity_version` (>= 1), `source_event_id`, `source_event_at`, `projected_at`.
6. **`product_projections` (`projections/models/product_projection.py`)**:
   - `product_id` (UUID PK), `sku` (indexado no único), `name`, `unit` (`UNIT`), `stock_on_hand` (>= 0), `active`, `created_by`, `updated_by`, `entity_version` (>= 1), `source_event_id`, `source_event_at`, `projected_at`.
7. **`inbox_events` (`projections/models/inbox_event.py`)**:
   - `event_id` (UUID PK), `consumer_group`, `topic`, `partition_number` (>= 0), `offset_value` (>= 0), `aggregate_id`, `event_type`, `schema_version` (>= 1), `entity_version` (>= 1), `correlation_id`, `event_occurred_at`, `payload_hash` (`char(64)`), `outcome` (`APPLIED`, `IGNORED_STALE`), `processed_at`.
   - `UNIQUE (consumer_group, topic, partition_number, offset_value)`.

---

## Fase 2: Paquete `core/` — Estándar HTTP, Trazabilidad, Autenticación JWT y RBAC Local

**Objetivo:** Implementar en `core/` los componentes transversales para que toda petición bajo `/api/purchases/**` cumpla el formato estándar de respuestas y errores, propague `X-Request-Id` y valide de forma autónoma el access token JWT y la proyección local del usuario.

- `core/api_response.py`: helpers de respuesta exitosa y paginación (`error: false`, `statusCode`, `message`, `data`, `meta`).
- `core/exception_handler.py`: handler global DRF con `error: true`, `statusCode`, `code`, `message`, `source: "purchases"`, `timestamp` UTC ISO 8601 y `details`.
- `core/audit_context.py`: middleware y utilidades para propagar o generar `X-Request-Id` y exponer el contexto del actor autenticado.
- `core/authentication.py`: validación independiente de `Authorization: Bearer <accessToken>` con `HS256`, `iss: "techdistribution-auth"`, `aud: "techdistribution-api"`, vigencia `iat`/`exp`/`JWT_MAX_TTL_SECONDS`, `role` (`ADMIN` o `PURCHASES_AGENT`) y `system == "PURCHASES"`.
- `core/permissions.py`: verificación del usuario en `user_projections` (`409 PROJECTION_NOT_READY` con `Retry-After: 2` si falta; `403 FORBIDDEN` si está inactivo o sin asignación en `PURCHASES`) y reglas de propiedad (`ADMIN` todas las órdenes; `PURCHASES_AGENT` solo propias).

---

## Fase 3: App `projections/` — Consumidores Kafka, Inbox Transaccional, DLQ y Bootstrap

**Objetivo:** Sincronizar asíncronamente `user_projections` y `product_projections` desde Apache Kafka con entrega idempotente, control de versiones monotónico, aislamiento en DLQ y soporte de reconstrucción.

- `projections/services/`: validación JSON Schema Draft 2020-12 (`event-envelope.schema.json`, `user-event.schema.json`, `product-event.schema.json`), aplicación transaccional `inbox_events` + upsert condicional por `entity_version` (`APPLIED` vs `IGNORED_STALE`), e importación administrativa de snapshots + watermark.
- `projections/consumers/`: consumidores para `auth.users.events` (grupo `purchases.auth-users.v1`, DLQ `purchases.auth-users.dlq`) e `inventory.products.events` (grupo `purchases.inventory-products.v1`, DLQ `purchases.inventory-products.dlq`) con `enable.auto.commit=false`, 5 reintentos con backoff exponencial (1, 2, 4, 8, 16s + jitter) y confirmación de offset posterior al commit.

---

## Fase 4: App `orders/` — Dominio de Órdenes, Snapshots, Concurrencia e Idempotencia

**Objetivo:** Implementar en `orders/serializers/`, `orders/services/`, `orders/views/` y `orders/urls/` los casos de uso y endpoints REST de órdenes de compra.

- `orders/serializers/`: validación de entrada/salida (1–100 líneas, `productId` sin duplicados, `unitPrice` como string decimal positivo con máximo 2 decimales, `expectedVersion`).
- `orders/services/`:
  - Verificación de productos en `product_projections` (`409 PROJECTION_NOT_READY` con `Retry-After: 2`; `409 PRODUCT_INACTIVE` si inactivo).
  - Captura de `sku_snapshot`, `name_snapshot` y `unit` en `DRAFT` y congelamiento definitivo en `SUBMITTED`.
  - Cálculo exacto de `line_total` y `total_amount` con `Decimal(18,2)`.
  - Transiciones `DRAFT -> SUBMITTED` y `DRAFT | SUBMITTED -> CANCELLED` con control optimista `expectedVersion` (`409 VERSION_CONFLICT`) y registro en `purchase_order_history`.
  - Idempotencia transaccional (`Idempotency-Key` UUID + `request_hash` SHA-256 en `POST /api/purchases/orders`, `submit` y `cancel`, devolviendo respuesta original o `409 IDEMPOTENCY_CONFLICT`).
- `orders/views/` y `orders/urls/`: endpoints con `trailing_slash=False` y documentación OpenAPI en `/api/purchases/openapi.json`.

---

## Fase 5: Pruebas de Aceptación, Calidad y Documentación Final

**Objetivo:** Verificar todos los criterios de aceptación del servicio en `orders/tests.py`, `projections/tests.py` y `core/tests.py`.

- Cobertura completa de JWT/RBAC, dinero exacto, inmutabilidad de snapshots históricos ante cambios posteriores del catálogo, idempotencia concurrente, conflictos de versión `409`, estados de proyección (`409 PROJECTION_NOT_READY`, `409 PRODUCT_INACTIVE`), deduplicación de inbox, DLQ y bootstrap.
- Validación de calidad en CI: `ruff check .`, `ruff format --check .`, `python manage.py check`, `python manage.py makemigrations --check --dry-run`, `python -Wa manage.py test` y construcción de imagen Docker.
