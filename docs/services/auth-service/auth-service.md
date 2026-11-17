# Auth: contrato de implementación

Las respuestas JSON de negocio siguen el [estándar común](../../standards/api-responses.md) y las credenciales siguen el [contrato de tokens y sesiones](../../standards/jwt-and-sessions.md).

Estado: implementados PostgreSQL con migraciones, dominio de usuarios con outbox transaccional, bootstrap del primer ADMIN, login con JWT, endpoints administrativos y publicador del outbox hacia Kafka (`auth.users.events`). Quedan las pruebas de aceptación y el cierre ([plan](./auth-implementation-plan.md)). No consulta a otros dominios por HTTP.

## Datos y seguridad

`Users`: UUID, email normalizado único, displayName, hash de contraseña Argon2id, active, version y timestamps UTC. `Systems`: código INVENTORY/PURCHASES único y duración de token positiva <=900 segundos por defecto, limitada por `JWT_MAX_TTL_SECONDS`. `UserSystems`: asignaciones únicas usuario/sistema/rol conforme a la matriz común. Contraseñas y hashes nunca se incluyen en respuestas, eventos ni logs.

El esquema lógico completo de `users`, `systems`, `user_systems`, auditoría,
outbox y la futura tabla de sesiones está en el
[modelo de datos planificado](../../architecture/data-model.md#auth-postgresql).

Bootstrap: comando administrativo local idempotente, fuera del HTTP público, crea el primer ADMIN desde variables temporales/secreto interactivo. No usar contraseña por defecto y no recrear/reactivar administradores existentes automáticamente. Registrar auditoría del bootstrap sin credenciales. Solo administradores gestionan usuarios/asignaciones; impedir desactivar al último administrador activo.

Login recibe `{email,password,system}`. Verificar usuario activo, contraseña y asignación explícita al sistema. Credenciales incorrectas, usuario desconocido/inactivo y falta de asignación devuelven un mensaje genérico 401. Rate limiting adicional por cuenta/IP en Auth cuando se implemente. Emitir HS256 con todos los claims del [contrato de access token](../../standards/jwt-and-sessions.md); TTL por sistema. Refresh permanece fuera del MVP actual, aunque su formato opaco, almacenamiento, cookies, CSRF, rotación y revocación ya están especificados para una ampliación posterior. Actualización de contraseña/desactivación no promete revocación inmediata de JWT ya emitidos; documentar vigencia máxima y eventos de estado.

## HTTP

| Endpoint | Permiso | Comportamiento |
| --- | --- | --- |
| `POST /api/auth/login` | Público | Credenciales/sistema → accessToken, tokenType Bearer, expiresIn |
| `POST /api/auth/users` | ADMIN | Crear usuario/asignaciones; 201; email duplicado 409 |
| `GET /api/auth/users` | ADMIN | Listado paginado de usuarios con sus asignaciones, sin hash de contraseña |
| `GET /api/auth/users/{id}` | ADMIN | Consultar un usuario; inexistente 404 |
| `PUT /api/auth/users/{id}` | ADMIN | Actualizar con expectedVersion; conflicto 409; desactivar con active:false |
| `GET /api/auth/systems` | ADMIN | Consultar sistemas y TTL |
| `PUT /api/auth/systems/{code}` | ADMIN | Cambiar TTL (1 a `JWT_MAX_TTL_SECONDS`) con expectedVersion para futuras emisiones |
| `GET /api/auth/openapi.json` | Desarrollo | Schema con paths completos y servidor `/` |

Códigos propios de Auth, además del [catálogo común](../../standards/api-responses.md): `401 INVALID_CREDENTIALS` (cualquier fallo de login, sin revelar la causa), `409 EMAIL_ALREADY_EXISTS` (email ya registrado tras normalizar) y `409 LAST_ACTIVE_ADMIN` (el cambio dejaría sin ningún ADMIN activo). Las rutas ADMIN aceptan un token ADMIN de cualquiera de los dos sistemas y además comprueban en la base que el usuario siga activo y conserve ese rol. `PUT /api/auth/users/{id}` es parcial: conserva los campos omitidos y `assignments` reemplaza la lista completa.

`POST /api/auth/refresh` y `POST /api/auth/logout` están reservados por el estándar, pero no forman parte de los endpoints del MVP ni deben exponerse parcialmente. Se habilitan juntos después de implementar sesiones renovables y los cambios correspondientes en el Gateway.

Usar migraciones. Guardar Users/asignaciones, versión y outbox en una transacción. Producir `UserCreated`/`UserUpdated` con snapshot público según [schema](../../../contracts/events/user-event.schema.json). Cambios de email, nombre, active o asignaciones generan evento; nunca distribuir el hash. Implementar publicador con orden por agregado y reintentos según [protocolo Kafka](../../architecture/event-driven-communication.md).

Aceptación: probar login por sistema/rol, expiración, aislamiento de permisos, desactivación, bootstrap idempotente, concurrencia, secretos ausentes en eventos y recuperación del outbox con Kafka caído. README propio debe indicar instalación, migraciones, bootstrap, variables, ejecución y pruebas.
