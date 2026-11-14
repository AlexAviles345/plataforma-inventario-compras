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
| ORM y migraciones | Pendiente de decisión entre TypeORM y Prisma |
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

## Fase 1: Persistencia PostgreSQL y migraciones

**Objetivo:** Materializar el esquema de Auth con migraciones versionadas.

- Conexión a `postgres-auth` (`127.0.0.1:5432`, `auth_db`) mediante `DATABASE_URL`, documentada en `.env.example`.
- Migraciones con los `CHECK`, `UNIQUE` e índices del modelo: `users`, `systems` (seed `INVENTORY` y `PURCHASES` con TTL 900), `user_systems` (combinaciones rol/sistema válidas), `auth_audit_log` y `outbox_events`.
- `/health/ready` verifica la conexión a la base.
- Script de migraciones y su ejecución automática desde `tools/dev.mjs`, como en Purchases.

## Fase 2: Dominio de usuarios y outbox transaccional

**Objetivo:** Casos de uso de usuarios y asignaciones con evento y auditoría en la misma transacción.

- Matriz rol/sistema, una asignación por sistema; email con trim + lowercase; `displayName` de 1 a 200 caracteres.
- Una transacción por cambio: usuario + asignaciones + `version++` + `auth_audit_log` + fila en `outbox_events` con `UserCreated`/`UserUpdated` (snapshot público validado con `ajv`, sin hash; `correlationId` = `X-Request-Id`).
- `expectedVersion` → `409 VERSION_CONFLICT`. Bloqueo de fila para impedir desactivar al último `ADMIN` activo.

## Fase 3: Bootstrap administrativo

- Comando `bootstrap:admin` fuera del HTTP público: email y nombre desde variables temporales, contraseña solicitada sin eco.
- Idempotente: no recrea ni reactiva administradores existentes. Auditoría `BOOTSTRAP_ADMIN` y `UserCreated` en outbox.

## Fase 4: Login, emisión JWT y autorización local

- `POST /api/auth/login` con `{email, password, system}`; usuario activo, contraseña y asignación verificados; cualquier fallo devuelve el mismo `401` genérico, con verificación Argon2 simulada para usuarios inexistentes.
- JWT HS256 con `sub`, `email`, `role`, `system`, `iat`, `exp`, `iss`, `aud`; TTL del sistema limitado por `JWT_MAX_TTL_SECONDS`.
- Guard propio que revalida el token y exige `role: ADMIN` en las rutas administrativas.

## Fase 5: Endpoints administrativos

- `POST /api/auth/users`, `GET /api/auth/users`, `GET /api/auth/users/{id}`, `PUT /api/auth/users/{id}`.
- `GET /api/auth/systems`, `PUT /api/auth/systems/{code}`.
- OpenAPI con la envoltura completa y ejemplos por status.

## Fase 6: Publicador del outbox hacia Kafka

- Publicación en `auth.users.events` con key `aggregateId`, un evento en vuelo por agregado y en orden de versión, productor idempotente y `acks=all`.
- `PUBLISHED` solo tras el acknowledgement; reintentos con backoff exponencial y jitter; leases vencidos recuperables.

## Fase 7: Pruebas de aceptación, CI y documentación final

- Login por sistema/rol, rechazo cruzado de tokens, expiración, desactivación, bootstrap idempotente, concurrencia, ausencia de secretos en eventos y recuperación del outbox con Kafka caído.
- Contenedor PostgreSQL en el job `auth` de GitHub Actions.
- README con instalación, migraciones, bootstrap, variables, ejecución y pruebas.
