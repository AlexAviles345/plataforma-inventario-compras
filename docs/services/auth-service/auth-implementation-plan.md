# Plan de Implementación por Fases — Auth Service

Este documento detalla el plan técnico secuencial para implementar el microservicio de autenticación (`auth-service`) en **NestJS 11 / Node 24 / PostgreSQL**, alineado con los contratos oficiales del repositorio:

- [Contrato de Auth](./auth-service.md)
- [Modelo de datos planificado](../../architecture/data-model.md#auth-postgresql)
- [Entrega de eventos y proyecciones](../../architecture/event-driven-communication.md)
- [Estándar de respuestas HTTP](../../standards/api-responses.md)
- [Estándar de access tokens y sesiones](../../standards/jwt-and-sessions.md)
- [Reglas comunes de implementación](../../standards/guidelines.md)

---

## Decisiones acordadas

| Tema | Decisión |
| --- | --- |
| Consulta de usuarios | Se agregan `GET /api/auth/users` (paginado) y `GET /api/auth/users/{id}`, solo ADMIN |
| Contraseñas | Entre 8 y 128 caracteres, con rechazo de contraseñas comunes |
| JSON Schemas de eventos | Se copian dentro del servicio (el contexto Docker solo incluye la carpeta del servicio); una prueba verifica que sigan idénticos a `contracts/events/` |
| Rate limiting de login en Auth | Pospuesto; el Gateway ya limita 10 intentos/minuto por IP |
| Hash de contraseñas | `argon2` (Argon2id) |
| JWT | `@nestjs/jwt`, la misma librería que valida en el Gateway |
| Validación de entrada | `class-validator` + `class-transformer` |
| Validación de eventos | `ajv` (JSON Schema 2020-12) |
| Cliente Kafka | `@confluentinc/kafka-javascript` |
| ORM y migraciones | TypeORM 1.x (`@nestjs/typeorm` 11, CommonJS como el resto de NestJS 11) con migraciones SQL escritas a mano y `synchronize` deshabilitado; exige Node ≥ 24.11 |
| `PUT /api/auth/users/{id}` | Actualización parcial con `expectedVersion`; los campos omitidos se conservan y `assignments`, si se envía, reemplaza la lista completa |
| Cambio de contraseña | Incrementa `version` y se audita, pero no publica evento porque el snapshot público no cambia |
| Códigos de error propios | `409 EMAIL_ALREADY_EXISTS` y `409 LAST_ACTIVE_ADMIN`, además del catálogo común |
| Variables de configuración | Cada variable (`DATABASE_URL`, `JWT_*`, `KAFKA_*`) se agrega en la fase que la utiliza |

---

## Fase 0: Base HTTP transversal — [COMPLETADA]

**Objetivo:** Toda respuesta bajo `/api/auth/**` cumple el estándar de respuestas y propaga `X-Request-Id` antes de implementar cualquier endpoint de negocio.

- `src/common/request-context.ts`: middleware registrado antes del body parser. Conserva el `X-Request-Id` entrante si es un UUID canónico, en caso contrario genera uno; lo devuelve en el header y lo expone con `AsyncLocalStorage` (`currentRequestId()`) para auditoría y outbox. Log estructurado por petición (`service`, `requestId`, `method`, `path` sin query, `status`, `durationMs`), desactivado en `NODE_ENV=test`.
- `src/common/api-response.ts`: tipos de la envoltura exitosa, decoradores `@ResponseMessage()` y `@SkipEnvelope()`, `PaginatedResult` y `PaginationQueryDto` (`page` ≥ 1, `limit` entre 1 y 100, 20 por defecto).
- `src/common/response-envelope.interceptor.ts`: interceptor global que envuelve una sola vez (`error: false`, `statusCode`, `message`, `data` nunca omitido, `meta` solo en colecciones paginadas). Health queda fuera de la envoltura.
- `src/common/errors.ts`: catálogo de códigos y `AuthDomainError` (status, código, mensaje, `details`, headers como `Retry-After`).
- `src/common/http-exception.filter.ts`: filtro global con `source: "auth"`, `timestamp` UTC y mensajes seguros; JSON malformado → `400 VALIDATION_ERROR`, rutas inexistentes → `404 RESOURCE_NOT_FOUND`, errores inesperados → `500 INTERNAL_ERROR` sin filtrar detalles internos.
- `src/common/validation.ts`: `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) con `details[].field` en rutas JSON del cliente (`assignments[0].role`) y `UNKNOWN_FIELD` para campos no declarados.
- OpenAPI declara `servers: [{"url":"/"}]`.
- Pruebas: `src/common/common.spec.ts` y `test/foundation.e2e-spec.ts` (controlador de prueba montado sobre `AppModule`).

---

## Fase 1: Persistencia PostgreSQL y migraciones — [COMPLETADA]

**Objetivo:** Materializar el esquema de Auth con migraciones versionadas.

- Conexión a `postgres-auth` con `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y `DB_POOL_MAX` (misma convención que Purchases): valores de `docker-compose` por defecto fuera de producción, obligatorias en producción. Documentadas en `.env.example`.
- `src/database/migrations/`: cinco migraciones SQL escritas a mano con nombres explícitos de restricciones: `users`, `systems` (seed `INVENTORY` y `PURCHASES` con TTL 900), `user_systems` (combinaciones rol/sistema válidas, una asignación por sistema, FKs `RESTRICT`), `auth_audit_log` (append-only mediante trigger) y `outbox_events` (estados, lease y `published_at` coherentes por `CHECK`).
- `src/database/entities/`: entidades con los mismos nombres de restricciones e índices; `password_hash` no se selecciona por defecto. Una prueba e2e verifica que entidades y migraciones no difieran.
- `npm run migration:run | migration:show | migration:revert` (`show` termina con código 1 si hay pendientes); `tools/dev.mjs` aplica las migraciones de Auth antes de arrancar.
- `/health/ready` ejecuta `SELECT 1` con timeout de 2 s y responde `503` si la base no está disponible.
- Pruebas e2e sobre la base `auth_db_test`, recreada en cada ejecución; el job `auth` de CI levanta su propio PostgreSQL y verifica que no queden migraciones pendientes.

## Fase 2: Dominio de usuarios y outbox transaccional — [COMPLETADA]

**Objetivo:** Casos de uso de usuarios y asignaciones con evento y auditoría en la misma transacción.

- `src/users/user-rules.ts`: email con trim + lowercase y el mismo formato `email` que valida `ajv`; `displayName` de 1 a 200 caracteres tras trim; contraseña de 8 a 128 caracteres Unicode, sin recortar, rechazando `src/users/common-passwords.ts` y un solo carácter repetido; matriz rol/sistema y una asignación por sistema. Los errores salen como `400 VALIDATION_ERROR` con `details[].field` (`assignments[1].role`) y nunca repiten la contraseña.
- `src/users/password-hasher.ts`: Argon2id (19 MiB, t=2, p=1), calculado antes de abrir la transacción.
- `src/users/users.service.ts`:
  - `createUser`: inserta usuario (`version` 1), asignaciones, `USER_CREATED` en auditoría y `UserCreated` en outbox en una transacción. Un email duplicado tras normalizar devuelve `409 EMAIL_ALREADY_EXISTS`, detectado por la restricción `uq_users_email`, por lo que también cubre carreras.
  - `updateUser`: actualización parcial con `expectedVersion`; `assignments` reemplaza la lista completa. Bloquea la fila (`FOR UPDATE`); una versión distinta devuelve `409 VERSION_CONFLICT`. Sin cambios reales no escribe nada. Un cambio incrementa `version` una vez y registra `USER_UPDATED` con los campos cambiados. Solo publica `UserUpdated` si cambia email, nombre, `active` o asignaciones; un cambio de contraseña no publica evento, y los consumidores toleran el salto de versión.
  - Último `ADMIN` activo: desactivar o retirar el último rol `ADMIN` de un usuario activo devuelve `409 LAST_ACTIVE_ADMIN`. Esas operaciones toman `pg_advisory_xact_lock` antes de contar, para que dos administradores que se desactivan mutuamente a la vez no dejen el sistema sin ninguno.
- `src/events/user-event.ts`: construye el evento v1 y lo valida con `ajv` (JSON Schema 2020-12 + formatos) contra `src/events/schemas/`, más las reglas del README de contratos (`aggregateId` = `data.userId`, una asignación por sistema). `correlationId` = `X-Request-Id`, o un UUID nuevo fuera de HTTP (`runWithRequestId` permite fijarlo desde CLI).
- `src/events/outbox.ts` y `src/audit/audit-log.ts`: escriben siempre con el `EntityManager` de la transacción del cambio.
- Pruebas:
  - unitarias: reglas, evento, y copias de schemas idénticas a `contracts/events/`;
  - e2e sobre PostgreSQL: atomicidad (la falla de la auditoría revierte usuario y outbox), ausencia de hash y contraseña en outbox y auditoría, conflictos de versión y email, reemplazo de asignaciones, actualizaciones sin cambios, y concurrencia del último `ADMIN` y de la misma versión.

## Fase 3: Bootstrap administrativo — [COMPLETADA]

- `npm run bootstrap:admin` (`node dist/cli/bootstrap-admin.js` en la imagen) arranca un contexto Nest sin HTTP. Email y nombre llegan en `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_DISPLAY_NAME`, variables temporales.
- `src/cli/password-prompt.ts`:
  - En terminal lee en modo raw, sin eco ni asteriscos, y pide la contraseña dos veces. Ctrl+C cancela con código 130.
  - Sin terminal lee una sola línea de la tubería y lo avisa por stderr.
  - La contraseña nunca se acepta como variable de entorno ni como argumento.
- `UsersService.bootstrapAdmin`:
  - Crea el usuario con ADMIN en INVENTORY y PURCHASES, solo si no existe ningún ADMIN activo. Lo comprueba dentro de la transacción, bajo el mismo `pg_advisory_xact_lock` que la protección del último ADMIN, por lo que dos bootstraps simultáneos crean uno solo.
  - Registra `BOOTSTRAP_ADMIN` en la auditoría (`actor_user_id` nulo, `details.source = "cli"`, sin credenciales) y `UserCreated` en el outbox.
  - Nunca reactiva, promueve ni sobrescribe usuarios existentes: un email ya registrado termina con `EMAIL_ALREADY_EXISTS`.
- Códigos de salida:
  - 0: creado, o ya existía un ADMIN activo (en ese caso no se pide la contraseña);
  - 1: variables faltantes, datos inválidos o email existente; se imprimen los detalles sin la contraseña;
  - 130: cancelado con Ctrl+C.
- Pruebas:
  - unitarias del prompt: sin eco, Backspace, secuencias de escape, Ctrl+C, confirmación y tubería;
  - e2e del servicio: creación, idempotencia, admin inactivo no reactivado, usuario existente no promovido y concurrencia;
  - e2e del flujo del comando, incluido el proceso real con la contraseña por tubería.

## Fase 4: Login, emisión JWT y autorización local — [COMPLETADA]

- Configuración: `JWT_SECRET` es obligatorio en todos los entornos, con la misma regla que el Gateway (al menos 32 bytes, sin valores de ejemplo). `JWT_ISSUER`, `JWT_AUDIENCE` y `JWT_MAX_TTL_SECONDS` usan por defecto los valores del estándar. `validateDatabaseEnvironment` permite que `migrate.js` funcione sin el secreto. `tools/dev.mjs` exige el `.env` de Auth.
- `POST /api/auth/login` (`src/auth/auth.controller.ts`, `auth.service.ts`):
  - Recibe `{email, password, system}`; el email se normaliza y la contraseña admite como máximo 128 caracteres.
  - Una sola consulta trae usuario, asignación al sistema y TTL. Siempre se ejecuta una verificación Argon2, contra un hash simulado si el usuario no existe.
  - Contraseña incorrecta, usuario inexistente o inactivo, o sin asignación responden el mismo `401 INVALID_CREDENTIALS`.
  - Responde `{accessToken, tokenType: "Bearer", expiresIn}` con `Cache-Control: no-store`.
- `src/auth/token.service.ts`: firma y verifica HS256 con algoritmo, emisor y audiencia fijados por configuración, nunca tomados del token. El TTL es el del sistema limitado por `JWT_MAX_TTL_SECONDS`, y `expiresIn` = `exp - iat`.
- `src/auth/token-claims.ts`: aplica las mismas comprobaciones que el Gateway (UUID, email, matriz rol/sistema, `iat` con 30 s de tolerancia, `exp` y TTL máximo).
- `src/auth/admin.guard.ts`:
  - Revalida el JWT del header `Authorization` y no confía en `x-user-*`. Acepta solo `role: ADMIN`, de cualquiera de los dos sistemas.
  - Además consulta la base: un usuario inactivo responde `401 INVALID_TOKEN` y uno sin ADMIN en ese sistema responde `403 FORBIDDEN`.
  - `@CurrentPrincipal()` entrega la identidad para usarla como actor en la fase 5.
- OpenAPI declara `bearer` y documenta el login.
- Pruebas:
  - unitarias de claims y configuración;
  - e2e HTTP:
    - claims y header del token, rol por sistema y TTL limitado;
    - el mismo 401 para los cinco casos de fallo, y una sola verificación Argon2 con usuario inexistente;
    - validación del body;
    - guard: sin token, token fuera del header, `x-user-*` ignorados, otro secreto, emisor, audiencia o algoritmo, `alg: none`, expiración, TTL excesivo, matriz inválida, desactivación y retiro del rol.
  - Se comprobó manualmente que el código de validación del Gateway acepta los tokens emitidos.

## Fase 5: Endpoints administrativos — [COMPLETADA]

- `src/admin/admin.module.ts` agrupa los controladores protegidos por `AdminGuard`, para evitar el ciclo `AuthModule` ↔ `UsersModule`. El actor de cada cambio es `@CurrentPrincipal().userId`.
- `src/users/users.controller.ts`:
  - `POST /users`: 201 con header `Location`.
  - `GET /users`: paginado con `PaginationQueryDto`, ordenado por email; las asignaciones de la página se cargan en una sola consulta.
  - `GET /users/{id}`: 404 si no existe o el id no es UUID.
  - `PUT /users/{id}`: parcial con `expectedVersion`.
- `src/users/users.dto.ts`: los DTO solo validan tipos y forma (`IS_STRING`, `IS_BOOLEAN`, `ARRAY_MAX_SIZE`, `UNKNOWN_FIELD`). Formato, política de contraseñas y matriz rol/sistema siguen en el dominio, con los mismos `details[].field`. Las respuestas nunca incluyen el hash.
- `src/systems/`:
  - `GET /systems` devuelve `maxAccessTokenTtlSeconds` (`JWT_MAX_TTL_SECONDS`) para que el frontend valide.
  - `PUT /systems/{code}` acepta un TTL de 1 a `JWT_MAX_TTL_SECONDS`, o devuelve `400 OUT_OF_RANGE`. Bloquea la fila, aplica `expectedVersion` (`409 VERSION_CONFLICT`) y audita `SYSTEM_UPDATED` con el TTL anterior y el nuevo. No publica eventos y solo afecta a emisiones futuras.
- `src/common/openapi.ts`: `@ApiSuccess` describe la envoltura real (`data`, más `meta` en las listas paginadas) y `@ApiErrors` publica un ejemplo nombrado por cada código de error, agrupado por status.
- Pruebas e2e HTTP (`test/admin.e2e-spec.ts`):
  - 401 y 403 en cada ruta;
  - creación con `Location` y auditoría del actor y del `X-Request-Id`;
  - validación de DTO y de dominio, y campos no declarados;
  - email duplicado, paginación y valores por defecto, 404;
  - `VERSION_CONFLICT` y `LAST_ACTIVE_ADMIN`;
  - TTL aplicado al siguiente login, sus límites y su auditoría;
  - paths y ejemplos en `openapi.json`.

## Fase 6: Publicador del outbox hacia Kafka

- Publicación en `auth.users.events` con key `aggregateId`, un evento en vuelo por agregado y en orden de versión, productor idempotente y `acks=all`.
- `PUBLISHED` solo tras el acknowledgement; reintentos con backoff exponencial y jitter; leases vencidos recuperables.

## Fase 7: Pruebas de aceptación, CI y documentación final

- Login por sistema/rol, rechazo cruzado de tokens, expiración, desactivación, bootstrap idempotente, concurrencia, ausencia de secretos en eventos y recuperación del outbox con Kafka caído.
- Contenedor PostgreSQL en el job `auth` de GitHub Actions.
- README con instalación, migraciones, bootstrap, variables, ejecución y pruebas.
