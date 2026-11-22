# Inventory Service

Servicio de catálogo y existencias de TechDistribution. Spring Boot 4.1.2, Java 21,
MySQL 8 con migraciones Flyway, publicación de eventos de producto hacia Kafka
mediante outbox transaccional y proyección local de usuarios consumida desde Auth. Contrato: [`docs/services/inventory-service/inventory-service.md`](../../../docs/services/inventory-service/inventory-service.md).

## Requisitos

- JDK 21 o posterior compatible (compila con `--release 21`). No se requiere Maven global.
- Docker: MySQL y Kafka locales en desarrollo, y Testcontainers en las pruebas.

## Ejecución local

Desde la raíz, `npm run dev` crea el `.env`, levanta MySQL/Kafka e inicia Inventory
junto al resto. Para arrancarlo solo:

```bash
npm run dev:infra                      # desde la raíz: MySQL, Kafka y tópicos
cd apps/backend/inventory-service
./mvnw spring-boot:run                 # Windows: mvnw.cmd spring-boot:run
```

Spring lee `.env` del directorio del servicio (`spring.config.import`); las variables
de entorno reales tienen prioridad. `npm run setup` lo genera desde `.env.example` con
el mismo `JWT_SECRET` que Gateway, Auth y Purchases. El arranque falla si el secreto
falta, es el valor de ejemplo o mide menos de 32 bytes.

| Variable | Defecto | Uso |
| --- | --- | --- |
| `PORT` | 8081 | Puerto HTTP |
| `DOCS_ENABLED` | true | OpenAPI y Swagger; `false` en producción (la imagen Docker ya lo fija) |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | 127.0.0.1, 3306, inventory_db | MySQL propio |
| `DB_USER`, `DB_PASSWORD`, `DB_POOL_MAX` | inventory_user, inventory_password, 10 | Credenciales y pool |
| `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_MAX_TTL_SECONDS` | — | Deben coincidir con Auth |
| `KAFKA_BOOTSTRAP_SERVERS` | 127.0.0.1:9092 | Broker de Kafka |
| `OUTBOX_PUBLISHER_ENABLED` | true | Con `false` los eventos esperan en `outbox_events` |
| `OUTBOX_POLL_INTERVAL_MS` | 1000 | Frecuencia del publicador |
| `USERS_CONSUMER_ENABLED` | true | Consumidor de usuarios de Auth |
| `USERS_CONSUMER_AUTO_OFFSET_RESET` | earliest | Solo para un grupo nuevo (bootstrap) |

## Migraciones

Flyway aplica `src/main/resources/db/migration` automáticamente al arrancar; no hay
paso manual. Las migraciones aplicadas son inmutables: un cambio de esquema es un
archivo `V<n>__descripcion.sql` nuevo. Hibernate no genera ni valida el esquema
(`ddl-auto: none`).

| Versión | Tablas |
| --- | --- |
| V1 | `products` (SKU único, stock >= 0, versión) |
| V2 | `stock_adjustments` (historial append-only de stock inicial y correcciones) |
| V3 | `outbox_events` (eventos pendientes de publicar) |
| V4 | `inbox_events`, `user_projections` (consumidor de usuarios de Auth) |

## Endpoints

Todos exigen un access token del sistema `INVENTORY` con rol `ADMIN` o
`INVENTORY_MANAGER`. El servicio vuelve a validar el JWT aunque el Gateway ya lo
haya hecho y no confía en los headers `x-user-*`. Además, igual que Purchases, el
usuario debe existir en la proyección local, estar activo y tener una asignación
INVENTORY: si aún no llegó su evento responde `409 PROJECTION_NOT_READY` con
`Retry-After: 2`; si está inactivo o sin asignación, `403 FORBIDDEN`. Una
desactivación en Auth corta el acceso al llegar el evento, sin esperar a que venza
el token.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/inventory/products?page&limit&search&active` | Catálogo paginado (limit máx. 100), orden por nombre |
| GET | `/api/inventory/products/stats` | Totales, activos, inactivos, agotados (activos con 0) y unidades |
| GET | `/api/inventory/products/{id}` | Detalle |
| POST | `/api/inventory/products` | 201; `{sku, name, unit?, stockOnHand}`; 409 `SKU_ALREADY_EXISTS` |
| PUT | `/api/inventory/products/{id}` | `{expectedVersion, sku, name, stockOnHand, active, reason?}`; 409 `VERSION_CONFLICT` |

Reglas: el SKU se guarda en mayúsculas y es único; un cambio de `stockOnHand`
exige `reason` (1–500 caracteres) y queda en `stock_adjustments`; `active:false`
desactiva sin borrar; un PUT sin cambios no incrementa la versión ni emite evento.
Las ediciones del mismo producto se serializan con `SELECT ... FOR UPDATE`.

Swagger en desarrollo: <http://localhost:8081/docs> y
`GET /api/inventory/openapi.json`. Salud: `/health/live`, `/health/ready`, `/actuator/health`.

## Eventos

Cada alta o cambio guarda producto, ajuste y evento en una sola transacción. El
publicador envía a `inventory.products.events` el snapshot completo
(`ProductCreated`/`ProductUpdated`, [schema](../../../contracts/events/product-event.schema.json))
con key = `aggregateId`, productor idempotente y `acks=all`:

- solo el evento de menor versión pendiente de cada producto es candidato, así se
  conserva el orden por producto aunque haya varias instancias;
- cada fila se reclama con un lease de 60 s; la marca `PUBLISHED` se pone solo tras
  el acknowledgement de Kafka;
- si Kafka falla, la fila vuelve a `PENDING` con backoff exponencial (1 s a 60 s) más
  jitter y `last_error` saneado; la API sigue funcionando;
- las filas publicadas se purgan a los 30 días.

## Proyección de usuarios

El consumidor del grupo `inventory.auth-users.v1` corre dentro del propio servicio
(no requiere otro proceso en `npm run dev`) y lee `auth.users.events`:

- valida cada mensaje contra `contracts/events/user-event.schema.json` (campos
  desconocidos incluidos) y que la key y `data.userId` coincidan con `aggregateId`;
- en una transacción inserta el evento en `inbox_events` y actualiza
  `user_projections` solo si la versión es mayor; los duplicados no cambian nada y
  las versiones antiguas quedan registradas como `IGNORED_STALE`;
- el offset se confirma por mensaje y solo después del commit en MySQL;
- un fallo transitorio se reintenta bloqueando la partición (1, 2, 4, 8 y 16 s más
  jitter); agotados los reintentos, o ante un error de schema, el mensaje original va
  a `inventory.auth-users.dlq` con posición, error saneado, intentos y fecha;
- si la DLQ no responde, el offset no se confirma y el mensaje se reprocesa.

La primera vez que el grupo se conecta lee desde el inicio del tópico (retención de
7 días), así recibe los usuarios ya creados.

## Snapshots y recuperación

Kafka retiene los eventos 7 días. Pasado ese plazo, reconstruir una proyección
requiere un snapshot con watermarks (último offset incluido por partición). Ambos
comandos se ejecutan **con Inventory detenido**; arrancan el servicio sin web, sin
consumidor ni publicador automático, hacen la tarea y terminan.

```bash
# Local (Windows: mvnw.cmd). En Docker: java -jar app.jar <comando> --file=...
./mvnw -q spring-boot:run -Dspring-boot.run.arguments="export-product-snapshot --file=productos.json"
./mvnw -q spring-boot:run -Dspring-boot.run.arguments="import-user-snapshot --file=usuarios.json"
```

**`export-product-snapshot`** (Inventory es el dueño de los productos): publica
primero todo lo pendiente del outbox (si Kafka no confirma, falla sin escribir el
archivo), lee el catálogo en una sola transacción y captura el último offset de cada
partición de `inventory.products.events`. Genera el formato que acepta Purchases:

```bash
python manage.py import_projection_snapshot --domain product --file productos.json
```

Después, el grupo `purchases.inventory-products.v1` debe continuar desde
`watermark + 1` en cada partición.

**`import-user-snapshot`**: carga un snapshot de usuarios de Auth con el mismo
formato que Purchases (`{"items": [...], "watermarks": {"0": 41}}` o un arreglo).
Valida el archivo completo antes de escribir (si un elemento es inválido no importa
nada), aplica todo en una transacción y solo reemplaza versiones menores, así que
repetirlo no cambia nada. Con watermarks deja el grupo `inventory.auth-users.v1` en
`watermark + 1` para que, al arrancar, reproduzca solo los eventos posteriores; usa
`--skip-offsets` para no moverlo. Auth todavía no tiene un exportador de usuarios.

Códigos de salida: 0 correcto, 1 error (con mensaje), 2 uso incorrecto.

## Pruebas

```bash
./mvnw -B -ntp verify          # Windows: mvnw.cmd -B -ntp verify
```

Requiere Docker: Testcontainers levanta `mysql:8.0` y `confluentinc/cp-kafka:7.4.0`.
Cubren el contrato de respuestas y errores, validación JWT/RBAC, validaciones de
entrada, control de versiones y concurrencia, auditoría de stock, paginación,
estadísticas, el formato del evento contra `contracts/events`, el publicador con
Kafka real y con Kafka caído, y el consumidor de usuarios: schema, duplicados,
versiones desordenadas, reintentos, DLQ, DLQ caída y acceso según la proyección.
Las de snapshots comprueban que snapshot + eventos posteriores al watermark
reproducen exactamente el estado actual, tanto de productos como de usuarios.
