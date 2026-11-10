# Modelo de datos planificado

Este documento define el modelo lógico que deberán materializar las migraciones de
Auth, Inventory y Purchases. Todavía no representa tablas implementadas. Los nombres
físicos se expresan en `snake_case`; los nombres JSON y de eventos conservan el
contrato público en `camelCase`.

## Propiedad y copias entre servicios

Cada servicio es propietario exclusivo de su base. Una proyección es una copia local
de solo lectura alimentada por Kafka, no una réplica SQL ni una relación entre bases.
No existen foreign keys, joins ni consultas SQL entre microservicios.

| Propietario y tablas fuente | Evento | Copia local destino | Datos copiados |
| --- | --- | --- | --- |
| Auth: `users` + `user_systems` | `UserCreated` / `UserUpdated` | Inventory: `user_projections` | Identidad pública, estado, asignaciones y versión |
| Auth: `users` + `user_systems` | `UserCreated` / `UserUpdated` | Purchases: `user_projections` | Identidad pública, estado, asignaciones y versión |
| Inventory: `products` | `ProductCreated` / `ProductUpdated` | Purchases: `product_projections` | Catálogo público, stock observado, auditoría pública y versión |

Nunca se copian `password_hash`, refresh tokens, hashes de sesión, datos internos de
outbox/inbox ni auditoría privada. `systems` tampoco se replica: los códigos y roles
válidos forman parte del contrato versionado.

El Gateway no posee base de datos. En particular, no conserva sesiones, usuarios,
respuestas de los dominios ni una caché autoritativa.

## Convenciones físicas

| Tipo lógico | PostgreSQL | MySQL | Regla |
| --- | --- | --- | --- |
| UUID | `uuid` | `binary(16)` | API y eventos usan texto canónico con guiones |
| Timestamp | `timestamptz` | `datetime(6)` | Siempre UTC |
| JSON | `jsonb` | `json` | Validar estructura antes de persistir |
| Dinero | `numeric(18,2)` | `decimal(18,2)` | Nunca `float`/`double` |
| Versión | `bigint` | `bigint unsigned` | Inicia en 1 y aumenta una unidad por cambio |
| Estado/rol/unidad | `varchar` + `CHECK` | `varchar` + `CHECK` | Evitar enums nativos difíciles de migrar |

Todos los timestamps son obligatorios salvo que la columna indique lo contrario.
Las entidades de negocio se desactivan o cancelan; no se borran físicamente durante
la operación normal. Las proyecciones no son objetivos válidos de foreign keys desde
tablas de negocio, porque deben poder reconstruirse e intercambiarse.

## Tablas técnicas compartidas

### `outbox_events`

Existe en Auth e Inventory. La entidad y su evento se insertan en la misma
transacción. Purchases no la necesita en el MVP porque no produce eventos.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `event_id` | UUID | No | PK; coincide con `eventId` del evento |
| `aggregate_type` | varchar(64) | No | `USER` o `PRODUCT` |
| `aggregate_id` | UUID | No | Identificador del agregado y key Kafka |
| `event_type` | varchar(64) | No | Tipo permitido por el schema vigente |
| `schema_version` | smallint | No | `1` para los contratos actuales |
| `entity_version` | bigint | No | Versión del agregado incluida en el evento |
| `topic` | varchar(255) | No | Tópico Kafka de destino |
| `partition_key` | varchar(128) | No | UUID canónico del agregado |
| `payload` | JSON | No | Evento completo ya validado |
| `correlation_id` | UUID | No | Request/evento que originó el cambio |
| `occurred_at` | timestamp UTC | No | `timestamp` público del evento |
| `status` | varchar(16) | No | `PENDING`, `PUBLISHING` o `PUBLISHED` |
| `attempt_count` | integer | No | Default 0; nunca negativo |
| `next_attempt_at` | timestamp UTC | No | Próximo intento con backoff |
| `locked_at` | timestamp UTC | Sí | Lease del publicador |
| `locked_by` | varchar(128) | Sí | Instancia propietaria del lease |
| `published_at` | timestamp UTC | Sí | Se asigna solo tras acknowledgement Kafka |
| `last_error` | varchar(1000) | Sí | Error saneado, sin payloads ni secretos |
| `created_at` | timestamp UTC | No | Inserción local |

Restricciones e índices obligatorios:

- `UNIQUE (aggregate_id, entity_version)` y `event_id` como PK.
- Índice `(status, next_attempt_at, created_at)` para el publicador.
- Índice `(aggregate_id, entity_version)` para preservar el orden por agregado.
- Un lease vencido puede recuperarse; solo un evento por agregado queda en vuelo.
- Las filas publicadas se conservan 30 días antes de una purga operativa.

### `inbox_events`

Existe en Inventory y Purchases. Se inserta junto con la actualización de la
proyección, antes de confirmar el offset Kafka.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `event_id` | UUID | No | PK y deduplicación global del evento |
| `consumer_group` | varchar(128) | No | Grupo lógico que procesó el mensaje |
| `topic` | varchar(255) | No | Tópico de origen |
| `partition_number` | integer | No | Partición Kafka, >= 0 |
| `offset_value` | bigint | No | Offset Kafka, >= 0 |
| `aggregate_id` | UUID | No | Usuario o producto afectado |
| `event_type` | varchar(64) | No | Tipo validado |
| `schema_version` | smallint | No | Versión validada del schema |
| `entity_version` | bigint | No | Versión recibida del agregado |
| `correlation_id` | UUID | No | Correlación del evento |
| `event_occurred_at` | timestamp UTC | No | Timestamp del productor |
| `payload_hash` | char(64) | No | SHA-256 del mensaje exacto, sin duplicar PII |
| `outcome` | varchar(24) | No | `APPLIED` o `IGNORED_STALE` |
| `processed_at` | timestamp UTC | No | Commit de inbox y proyección |

También lleva `UNIQUE (consumer_group, topic, partition_number, offset_value)`.
Los eventos inválidos se aíslan en la DLQ y no se fuerzan dentro de esta tabla.

## Auth (PostgreSQL)

Auth es propietario de usuarios, sistemas, asignaciones y credenciales. Sus tablas
del MVP son `users`, `systems`, `user_systems`, `auth_audit_log` y `outbox_events`.

### `users`

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `email` | varchar(254) | No | Normalizado con trim + lowercase; único |
| `display_name` | varchar(200) | No | Entre 1 y 200 caracteres tras trim |
| `password_hash` | varchar(255) | No | Hash Argon2id; nunca sale de Auth |
| `active` | boolean | No | Default `true`; desactivación lógica |
| `version` | bigint | No | Default 1; control optimista |
| `created_at` | timestamp UTC | No | Creación |
| `updated_at` | timestamp UTC | No | Último cambio confirmado |

`UNIQUE (email)` se aplica sobre el valor ya normalizado. No hay borrado físico de
usuarios. Un cambio público incrementa `version` e inserta su outbox en la misma
transacción.

### `systems`

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `code` | varchar(32) | No | PK; `INVENTORY` o `PURCHASES` |
| `access_token_ttl_seconds` | integer | No | > 0 y <= 3600; además limitado por configuración |
| `version` | bigint | No | Default 1; evita perder cambios de TTL |
| `created_at` | timestamp UTC | No | Seed inicial |
| `updated_at` | timestamp UTC | No | Último cambio |

Una migración de datos crea exactamente los dos sistemas. El valor inicial de TTL es
900 segundos. Cambiarlo no altera tokens ya emitidos.

### `user_systems`

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK local a `users.id`, `ON DELETE RESTRICT` |
| `system_code` | varchar(32) | No | FK local a `systems.code`, `ON DELETE RESTRICT` |
| `role` | varchar(32) | No | Rol permitido para el sistema |
| `created_at` | timestamp UTC | No | Alta de asignación |
| `updated_at` | timestamp UTC | No | Cambio de rol |

Lleva `UNIQUE (user_id, system_code)`. Los checks permiten `ADMIN` o
`INVENTORY_MANAGER` para INVENTORY, y `ADMIN` o `PURCHASES_AGENT` para PURCHASES.
Crear, cambiar o retirar una asignación incrementa la versión del usuario y publica
un snapshot completo.

### `auth_audit_log`

Registro append-only para bootstrap y operaciones administrativas; no sustituye al
outbox.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `actor_user_id` | UUID | Sí | Usuario actor; nulo para bootstrap inicial |
| `action` | varchar(64) | No | Acción estable, por ejemplo `BOOTSTRAP_ADMIN` |
| `target_type` | varchar(64) | No | `USER`, `SYSTEM` o `ASSIGNMENT` |
| `target_key` | varchar(128) | Sí | UUID canónico o código del recurso afectado |
| `target_version` | bigint | Sí | Versión resultante del agregado |
| `request_id` | UUID | Sí | Correlación HTTP/CLI |
| `details` | JSON | No | Metadatos saneados; jamás hashes o credenciales |
| `created_at` | timestamp UTC | No | Momento del cambio |

Índices: `(target_type, target_key, created_at)` y `(actor_user_id, created_at)`.

### `refresh_sessions` — ampliación posterior, fuera del MVP

No se crea ni se usa hasta habilitar conjuntamente refresh/logout.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK; una fila por token rotado |
| `family_id` | UUID | No | Agrupa toda la cadena de rotación |
| `user_id` | UUID | No | FK local a `users.id` |
| `system_code` | varchar(32) | No | FK local a `systems.code`; nunca cambia |
| `token_hash` | char(64) | No | SHA-256 hexadecimal; único |
| `csrf_hash` | char(64) | No | SHA-256 del token CSRF |
| `created_at` | timestamp UTC | No | Creación de esta rotación |
| `expires_at` | timestamp UTC | No | Expiración absoluta heredada de la familia |
| `last_used_at` | timestamp UTC | Sí | Consumo exitoso de esta rotación |
| `revoked_at` | timestamp UTC | Sí | Revocación de la fila/familia |
| `revocation_reason` | varchar(64) | Sí | Logout, cambio de usuario o reutilización |
| `replaced_by_id` | UUID | Sí | FK diferida a la siguiente `refresh_sessions.id` |

Índices: `UNIQUE (token_hash)`, `(family_id, created_at)` y
`(user_id, system_code, revoked_at)`. Nunca se almacena el refresh token original.

## Inventory (MySQL)

Inventory es propietario del catálogo y stock. Sus tablas del MVP son `products`,
`stock_adjustments`, `user_projections`, `inbox_events` y `outbox_events`.

### `products`

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `sku` | varchar(64) | No | Canonicalizado; único |
| `name` | varchar(200) | No | Entre 1 y 200 caracteres tras trim |
| `unit` | varchar(16) | No | Solo `UNIT` en el MVP |
| `stock_on_hand` | bigint | No | >= 0 |
| `active` | boolean | No | Default `true`; desactivación lógica |
| `version` | bigint | No | Default 1; control optimista |
| `created_by` | UUID | No | `sub` del JWT; sin FK a la proyección |
| `updated_by` | UUID | No | Actor del último cambio |
| `created_at` | timestamp UTC | No | Creación |
| `updated_at` | timestamp UTC | No | Último cambio |

Lleva `UNIQUE (sku)` e índice `(active, name, id)` para el catálogo. Un cambio crea
`ProductCreated`/`ProductUpdated` en outbox dentro de la misma transacción.

### `stock_adjustments`

Historial tipado y append-only del stock inicial y sus correcciones explícitas.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK local a `products.id`, `ON DELETE RESTRICT` |
| `product_version` | bigint | No | Versión del producto resultante |
| `adjustment_type` | varchar(16) | No | `INITIAL` o `CORRECTION` |
| `previous_stock` | bigint | No | >= 0; 0 para el alta inicial |
| `new_stock` | bigint | No | >= 0 |
| `delta` | bigint | No | `new_stock - previous_stock` |
| `reason` | varchar(500) | No | Motivo administrativo saneado |
| `actor_user_id` | UUID | No | Usuario del JWT; sin FK a proyección |
| `request_id` | UUID | No | Correlación del Gateway |
| `created_at` | timestamp UTC | No | Momento de la corrección |

Lleva `UNIQUE (product_id, product_version)` e índice
`(product_id, created_at)`. Producto, ajuste y outbox se confirman juntos.

### `user_projections`

Copia local del snapshot público producido por Auth; solo el consumidor o importador
administrativo puede escribirla.

| Columna | Tipo lógico | Nulo | Origen o propósito |
| --- | --- | --- | --- |
| `user_id` | UUID | No | PK; `data.userId` |
| `email` | varchar(254) | No | `data.email`; no contiene credenciales |
| `display_name` | varchar(200) | No | `data.displayName` |
| `active` | boolean | No | `data.active` |
| `assignments` | JSON | No | Array completo `{system, role}`, máximo 2 |
| `entity_version` | bigint | No | `entityVersion`; solo aumenta |
| `source_event_id` | UUID | No | Último evento aplicado |
| `source_event_at` | timestamp UTC | No | Timestamp del productor |
| `projected_at` | timestamp UTC | No | Commit local de la proyección |

`email` se indexa sin unicidad: durante cambios entre agregados Kafka no ofrece orden
global. La aplicación consulta `user_id`, `active` y la asignación INVENTORY.

## Purchases (PostgreSQL)

Purchases es propietario de órdenes e idempotencia. Sus tablas del MVP son
`purchase_orders`, `purchase_order_lines`, `idempotency_keys`,
`purchase_order_history`, `user_projections`, `product_projections` e
`inbox_events`. No tiene outbox en el MVP.

### `purchase_orders`

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `requester_id` | UUID | No | `sub` creador; sin FK a proyección |
| `supplier_name` | varchar(200) | No | Snapshot obligatorio, 1–200 caracteres |
| `currency` | char(3) | No | Solo `MXN` en el MVP |
| `status` | varchar(16) | No | `DRAFT`, `SUBMITTED` o `CANCELLED` |
| `total_amount` | numeric(18,2) | No | Total exacto calculado por servidor, > 0 |
| `version` | bigint | No | Default 1; control optimista |
| `last_modified_by` | UUID | No | Actor del último cambio |
| `submitted_at` | timestamp UTC | Sí | Fecha de envío; nula si se cancela desde DRAFT |
| `cancelled_at` | timestamp UTC | Sí | Obligatorio únicamente en `CANCELLED` |
| `created_at` | timestamp UTC | No | Creación |
| `updated_at` | timestamp UTC | No | Último cambio |

Índices: `(requester_id, created_at DESC, id)` y
`(status, created_at DESC, id)`. DRAFT mantiene ambas fechas de transición nulas;
SUBMITTED exige `submitted_at`; CANCELLED exige `cancelled_at` y puede conservar
`submitted_at` si antes fue enviada. No se elimina una orden confirmada.

### `purchase_order_lines`

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `order_id` | UUID | No | FK local a `purchase_orders.id`, `ON DELETE RESTRICT` |
| `position` | smallint | No | 1–100; orden estable dentro de la orden |
| `product_id` | UUID | No | ID de Inventory; sin FK a proyección |
| `sku_snapshot` | varchar(64) | No | SKU histórico al editar/enviar |
| `name_snapshot` | varchar(200) | No | Nombre histórico |
| `unit` | varchar(16) | No | Solo `UNIT` |
| `quantity` | integer | No | > 0 |
| `unit_price` | numeric(18,2) | No | > 0; máximo dos decimales |
| `line_total` | numeric(18,2) | No | `quantity * unit_price`, validado por servidor |
| `created_at` | timestamp UTC | No | Alta de línea |
| `updated_at` | timestamp UTC | No | Última edición mientras sea DRAFT |

Restricciones: `UNIQUE (order_id, position)` y
`UNIQUE (order_id, product_id)`. El total de la orden es la suma exacta de sus líneas.
La aplicación y las pruebas garantizan entre 1 y 100 líneas por orden.

### `idempotency_keys`

La key, la orden y la respuesta se confirman en la misma transacción. Una validación
rechazada antes del commit no crea esta fila.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK interna |
| `requester_id` | UUID | No | Actor propietario de la key |
| `idempotency_key` | UUID | No | Valor del header |
| `operation` | varchar(24) | No | `CREATE_ORDER`, `SUBMIT_ORDER` o `CANCEL_ORDER` |
| `order_id` | UUID | No | FK local a `purchase_orders.id` |
| `request_hash` | char(64) | No | SHA-256 del request canónico |
| `response_status` | smallint | No | Status HTTP original |
| `response_body` | JSON | No | Envoltura de respuesta original |
| `created_at` | timestamp UTC | No | Primer resultado confirmado |

Lleva `UNIQUE (requester_id, idempotency_key)` e índice `(order_id, created_at)`.
Una key no puede reutilizarse para otra operación, aunque cambie el endpoint.

### `purchase_order_history`

Auditoría append-only de cada versión confirmada de la orden.

| Columna | Tipo lógico | Nulo | Regla o propósito |
| --- | --- | --- | --- |
| `id` | UUID | No | PK |
| `order_id` | UUID | No | FK local a `purchase_orders.id` |
| `order_version` | bigint | No | Versión resultante |
| `action` | varchar(24) | No | `CREATED`, `UPDATED`, `SUBMITTED` o `CANCELLED` |
| `from_status` | varchar(16) | Sí | Nulo en creación |
| `to_status` | varchar(16) | No | Estado después del cambio |
| `actor_user_id` | UUID | No | Actor autenticado |
| `request_id` | UUID | No | Correlación del Gateway |
| `changes` | JSON | No | Resumen saneado; sin JWT ni headers sensibles |
| `created_at` | timestamp UTC | No | Momento del cambio |

Lleva `UNIQUE (order_id, order_version)` e índice `(order_id, created_at)`.

### `user_projections`

Tiene el mismo significado que la proyección de Inventory, pero reside en PostgreSQL
de Purchases y la escribe el grupo `purchases.auth-users.v1`.

| Columna | Tipo lógico | Nulo | Origen o propósito |
| --- | --- | --- | --- |
| `user_id` | UUID | No | PK; `data.userId` |
| `email` | varchar(254) | No | `data.email` |
| `display_name` | varchar(200) | No | `data.displayName` |
| `active` | boolean | No | `data.active` |
| `assignments` | JSON | No | Snapshot completo de asignaciones |
| `entity_version` | bigint | No | Última versión aplicada |
| `source_event_id` | UUID | No | Último evento aplicado |
| `source_event_at` | timestamp UTC | No | Timestamp del productor |
| `projected_at` | timestamp UTC | No | Commit local |

Índice no único sobre `email`. Para operar una orden se comprueban `active` y la
asignación PURCHASES, además del JWT.

### `product_projections`

Copia local del snapshot público de Inventory escrita exclusivamente por
`purchases.inventory-products.v1`.

| Columna | Tipo lógico | Nulo | Origen o propósito |
| --- | --- | --- | --- |
| `product_id` | UUID | No | PK; `data.productId` |
| `sku` | varchar(64) | No | `data.sku` |
| `name` | varchar(200) | No | `data.name` |
| `unit` | varchar(16) | No | `data.unit`; actualmente `UNIT` |
| `stock_on_hand` | bigint | No | `data.stockOnHand`; dato observado, no reserva stock |
| `active` | boolean | No | `data.active` |
| `created_by` | UUID | No | `data.createdBy` |
| `updated_by` | UUID | No | `data.updatedBy` |
| `entity_version` | bigint | No | Última versión aplicada |
| `source_event_id` | UUID | No | Último evento aplicado |
| `source_event_at` | timestamp UTC | No | Timestamp del productor |
| `projected_at` | timestamp UTC | No | Commit local |

`sku` tiene índice no único para evitar conflictos temporales entre agregados de
particiones distintas. Las órdenes referencian `product_id`; copian SKU, nombre y
unidad a sus líneas. `stock_on_hand` nunca autoriza ni descuenta existencias.

## Transacciones y orden de migraciones

- Auth confirma `users`/`user_systems` + `auth_audit_log` + `outbox_events` en una
  sola transacción cuando corresponda.
- Inventory confirma `products` + `stock_adjustments` + `outbox_events` juntos; su
  consumidor confirma `inbox_events` + `user_projections` juntos.
- Purchases confirma orden + líneas + idempotencia + historial juntos; cada
  consumidor confirma inbox + su proyección en otra transacción local.
- El upsert de una proyección solo aplica si la `entity_version` entrante es mayor.
- Las migraciones crean primero tablas propietarias, después técnicas/proyecciones,
  restricciones e índices, y finalmente los seeds controlados.

Las tablas `auth_*` que el scaffold de Django genera actualmente son infraestructura
del framework, no usuarios del dominio. Pueden eliminarse al reducir las aplicaciones
instaladas si DRF ya no las requiere, pero mientras existan no se siembran ni se
relacionan con órdenes. `user_projections` es la única fuente local de usuarios de
Auth en Purchases.

## Fuera del modelo MVP

No se planifican todavía tablas de proveedores, recepción, reservas, pagos, facturas,
movimientos automáticos de stock por compras ni sagas. Añadir cualquiera exige cerrar
primero sus invariantes, idempotencia y contratos de eventos.
