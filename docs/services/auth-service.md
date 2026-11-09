# Auth: contrato de implementación

Estado: base NestJS ejecutable con configuración validada, salud, OpenAPI, Docker y pruebas. El dominio, PostgreSQL y el productor Kafka siguen planificados. No consulta a otros dominios por HTTP.

## Datos y seguridad

`Users`: UUID, email normalizado único, displayName, hash de contraseña Argon2id, active, version y timestamps UTC. `Systems`: código INVENTORY/PURCHASES único y duración de token positiva <=900 segundos por defecto, limitada por `JWT_MAX_TTL_SECONDS`. `UserSystems`: asignaciones únicas usuario/sistema/rol conforme a la matriz común. Contraseñas y hashes nunca se incluyen en respuestas, eventos ni logs.

Bootstrap: comando administrativo local idempotente, fuera del HTTP público, crea el primer ADMIN desde variables temporales/secreto interactivo. No usar contraseña por defecto y no recrear/reactivar administradores existentes automáticamente. Registrar auditoría del bootstrap sin credenciales. Solo administradores gestionan usuarios/asignaciones; impedir desactivar al último administrador activo.

Login recibe `{email,password,system}`. Verificar usuario activo, contraseña y asignación explícita al sistema. Credenciales incorrectas, usuario desconocido/inactivo y falta de asignación devuelven un mensaje genérico 401. Rate limiting adicional por cuenta/IP en Auth cuando se implemente. Emitir HS256 con todos los claims del [contrato común](../standards/guidelines.md); TTL por sistema, sin refresh token. Actualización de contraseña/desactivación no promete revocación inmediata de JWT ya emitidos; documentar vigencia máxima y eventos de estado.

## HTTP

| Endpoint | Permiso | Comportamiento |
| --- | --- | --- |
| `POST /api/auth/login` | Público | Credenciales/sistema → accessToken, tokenType Bearer, expiresIn |
| `POST /api/auth/users` | ADMIN | Crear usuario/asignaciones; 201; email duplicado 409 |
| `PUT /api/auth/users/{id}` | ADMIN | Actualizar con expectedVersion; conflicto 409; desactivar con active:false |
| `GET /api/auth/systems` | ADMIN | Consultar sistemas y TTL |
| `PUT /api/auth/systems/{code}` | ADMIN | Cambiar TTL validado para futuras emisiones |
| `GET /api/auth/openapi.json` | Desarrollo | Schema con paths completos y servidor `/` |

Usar migraciones. Guardar Users/asignaciones, versión y outbox en una transacción. Producir `UserCreated`/`UserUpdated` con snapshot público según [schema](../../contracts/events/user-event.schema.json). Cambios de email, nombre, active o asignaciones generan evento; nunca distribuir el hash. Implementar publicador con orden por agregado y reintentos según [protocolo Kafka](../architecture/event-driven-communication.md).

Aceptación: probar login por sistema/rol, expiración, aislamiento de permisos, desactivación, bootstrap idempotente, concurrencia, secretos ausentes en eventos y recuperación del outbox con Kafka caído. README propio debe indicar instalación, migraciones, bootstrap, variables, ejecución y pruebas.
