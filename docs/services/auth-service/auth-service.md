# Auth: contrato de implementación

Las respuestas JSON de negocio siguen el [estándar común](../../standards/api-responses.md) y las credenciales siguen el [contrato de tokens y sesiones](../../standards/jwt-and-sessions.md).

Estado: implementados PostgreSQL con migraciones, dominio de usuarios con outbox transaccional, bootstrap del primer ADMIN, access tokens JWT, sesiones renovables, endpoints administrativos y publicador del outbox hacia Kafka (`auth.users.events`). No consulta a otros dominios por HTTP.

## Datos y seguridad

`Users`: UUID, email normalizado único, displayName, hash de contraseña Argon2id, active, version y timestamps UTC. `Systems`: código INVENTORY/PURCHASES único y duración de token positiva <=900 segundos por defecto, limitada por `JWT_MAX_TTL_SECONDS`. `UserSystems`: asignaciones únicas usuario/sistema/rol conforme a la matriz común. Contraseñas y hashes nunca se incluyen en respuestas, eventos ni logs.

El esquema lógico completo de `users`, `systems`, `user_systems`, auditoría,
outbox y `refresh_sessions` está en el
[modelo de datos planificado](../../architecture/data-model.md#auth-postgresql).

Bootstrap: comando administrativo local idempotente, fuera del HTTP público, crea el primer ADMIN desde variables temporales/secreto interactivo. No usar contraseña por defecto y no recrear/reactivar administradores existentes automáticamente. Registrar auditoría del bootstrap sin credenciales. Solo administradores gestionan usuarios/asignaciones; impedir desactivar al último administrador activo.

Login recibe `{email,password}` (y `system` opcional para clientes que requieran un único sistema). Verifica usuario activo, contraseña y al menos una asignación válida (o asignación explícita si se envió `system`), crea una familia en `refresh_sessions` persistiendo sólo hashes SHA-256 y devuelve en `tokens` el conjunto completo de access tokens para los sistemas autorizados del usuario. Credenciales incorrectas, usuario desconocido/inactivo y falta de asignación devuelven un mensaje genérico 401. Auth emite HS256 con todos los claims del [contrato de access token](../../standards/jwt-and-sessions.md) y TTL por sistema. Refresh rota token y CSRF de forma transaccional sin extender la expiración absoluta, emitiendo también `tokens` actualizados. Contraseña, desactivación y cambios de asignación revocan las familias correspondientes; los JWT ya emitidos conservan su vigencia corta hasta `exp`.

## HTTP

| Endpoint | Permiso | Comportamiento |
| --- | --- | --- |
| `POST /api/auth/login` | Público | `{email, password}` (y `system` opcional) → `accessToken`, `tokenType`, `expiresIn` y `tokens[]` |
| `POST /api/auth/refresh` | Cookie + CSRF | Rotación de un solo uso → nuevo `accessToken`, `tokens[]` vigentes y cookies |
| `POST /api/auth/logout` | Cookie + CSRF | Revoca la familia y limpia cookies; idempotente |
| `POST /api/auth/users` | ADMIN | Crear usuario/asignaciones; 201; email duplicado 409 |
| `GET /api/auth/users` | ADMIN | Listado paginado de usuarios con sus asignaciones, sin hash de contraseña |
| `GET /api/auth/users/stats` | ADMIN | Estadísticas agregadas de usuarios (`totalUsers`, `activeUsers`, `inactiveUsers`, `inventoryUsers`, `purchasesUsers`, `adminUsers`) |
| `GET /api/auth/users/{id}` | ADMIN | Consultar un usuario; inexistente 404 |
| `PUT /api/auth/users/{id}` | ADMIN | Actualizar con expectedVersion; conflicto 409; desactivar con active:false |
| `GET /api/auth/openapi.json` | Desarrollo | Schema con paths completos y servidor `/` |

Códigos propios de Auth, además del [catálogo común](../../standards/api-responses.md): `401 INVALID_CREDENTIALS`, `401 INVALID_REFRESH_TOKEN`, `403 CSRF_VALIDATION_FAILED`, `409 EMAIL_ALREADY_EXISTS` y `409 LAST_ACTIVE_ADMIN`. Login y refresh no revelan la causa específica del rechazo. Las rutas ADMIN aceptan un token ADMIN de cualquiera de los dos sistemas y además comprueban en la base que el usuario siga activo y conserve ese rol. `PUT /api/auth/users/{id}` es parcial: conserva los campos omitidos y `assignments` reemplaza la lista completa.

Usar migraciones. Guardar Users/asignaciones, versión y outbox en una transacción. Producir `UserCreated`/`UserUpdated` con snapshot público según [schema](../../../contracts/events/user-event.schema.json). Cambios de email, nombre, active o asignaciones generan evento; nunca distribuir el hash. Implementar publicador con orden por agregado y reintentos según [protocolo Kafka](../../architecture/event-driven-communication.md).

Aceptación: probar login por sistema/rol, expiración, aislamiento de permisos, desactivación, bootstrap idempotente, concurrencia, secretos ausentes en eventos y recuperación del outbox con Kafka caído. README propio debe indicar instalación, migraciones, bootstrap, variables, ejecución y pruebas.
