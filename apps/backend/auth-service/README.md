# Auth Service

Base ejecutable del servicio de autenticación de TechDistribution. Usa NestJS 11, Node 24, npm 11, PostgreSQL y TypeORM 1.x. La implementación de usuarios, sistemas, login, JWT y publicación Kafka se agrega por fases según el [plan de implementación](../../../docs/services/auth-service/auth-implementation-plan.md).

## Requisitos

- Node.js 24.11 o posterior dentro de la rama 24.x (mínimo exigido por TypeORM 1.x).
- npm 11.x.
- Acceso al mirror npm configurado en `.npmrc`.
- PostgreSQL de Auth en ejecución (`postgres-auth` del Compose de ejemplo, puerto local 5432).

## Inicialización

```bat
cd apps\backend\auth-service
set npm_config_offline=
set HTTP_PROXY=
set HTTPS_PROXY=
npm ci
copy .env.example .env
```

| Variable | Por defecto fuera de producción | Uso |
| --- | --- | --- |
| `PORT` | 3001 | Puerto HTTP |
| `NODE_ENV` | development | `development`, `test` o `production` |
| `DOCS_ENABLED` | true (false en producción) | Swagger y OpenAPI; prohibido en producción |
| `DB_HOST` / `DB_PORT` | 127.0.0.1 / 5432 | Servidor PostgreSQL |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | auth_db / auth_user / auth_password | Credenciales de demostración del Compose |
| `DB_POOL_MAX` | 10 | Conexiones máximas del pool (1–100) |
| `DB_TEST_NAME` | auth_db_test | Base de las pruebas e2e; debe terminar en `_test` |
| `JWT_SECRET` | **ninguno, obligatorio** | Secreto HS256 de al menos 32 bytes; el mismo del Gateway |
| `JWT_ISSUER` / `JWT_AUDIENCE` | techdistribution-auth / techdistribution-api | Deben coincidir con el Gateway y los servicios |
| `JWT_MAX_TTL_SECONDS` | 900 | Vigencia máxima del access token (1–3600) |

En producción `DB_HOST`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` son obligatorios y no tienen valores por defecto. `JWT_SECRET` es obligatorio en todos los entornos y rechaza los valores de ejemplo: copia en `.env` el mismo `JWT_SECRET` de `apps/backend/api-gateway/.env`. `migrate.js` solo valida las variables de PostgreSQL.

## Base de datos y migraciones

Desde la raíz del repositorio, levantar PostgreSQL:

```bash
docker compose -f docker-compose.example.yml up -d --wait postgres-auth
```

Las migraciones están en `src/database/migrations` y se escriben a mano en SQL; `synchronize` está deshabilitado. `npm run dev` en la raíz las aplica automáticamente.

```bat
npm run migration:run     :: aplica las pendientes
npm run migration:show    :: termina con código 1 si hay pendientes
npm run migration:revert  :: revierte la última
```

En la imagen Docker se ejecutan con `node dist/database/migrate.js run`. Cada constraint, índice y llave tiene nombre explícito y coincide con las entidades de `src/database/entities`; una prueba e2e verifica que no haya diferencias.

## Primer administrador (bootstrap)

No existe contraseña ni usuario por defecto. El primer ADMIN se crea con un comando local, fuera del HTTP público. Email y nombre se pasan como variables **solo para esa ejecución**, no las guardes en `.env`. La contraseña se pide dos veces y no se muestra mientras se escribe:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@techdistribution.com BOOTSTRAP_ADMIN_DISPLAY_NAME="Administrador" npm run bootstrap:admin
```

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL='admin@techdistribution.com'; $env:BOOTSTRAP_ADMIN_DISPLAY_NAME='Administrador'; npm run bootstrap:admin; Remove-Item Env:BOOTSTRAP_ADMIN_*
```

- Crea un usuario con rol ADMIN en INVENTORY y PURCHASES, registra `BOOTSTRAP_ADMIN` en la auditoría (sin credenciales) y deja `UserCreated` en el outbox.
- Es idempotente: si ya hay un ADMIN activo, termina con código 0 sin pedir la contraseña ni cambiar nada. Nunca reactiva, promueve ni sobrescribe un usuario existente; un email ya registrado termina con código 1.
- Para automatizar, la contraseña se puede enviar por tubería en una sola línea: `printf '%s\n' "$CLAVE" | npm run bootstrap:admin`. Nunca se acepta como variable de entorno ni como argumento.
- En la imagen Docker: `docker run --rm -it -e DB_HOST=... -e BOOTSTRAP_ADMIN_EMAIL=... -e BOOTSTRAP_ADMIN_DISPLAY_NAME=... <imagen> node dist/cli/bootstrap-admin.js`.
- En la ventana independiente de Git Bash (mintty), Node no detecta una terminal y la contraseña se vería al escribirla. Usa la terminal integrada de VS Code, PowerShell, `winpty npm run bootstrap:admin` o la tubería.

## Login y tokens

```bash
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@techdistribution.com","password":"<contraseña>","system":"INVENTORY"}'
```

- Responde `{accessToken, tokenType: "Bearer", expiresIn}` con `Cache-Control: no-store`. El token es HS256 con `sub`, `email`, `role`, `system`, `iat`, `exp`, `iss` y `aud`, y el rol es el asignado al usuario en el sistema pedido.
- `expiresIn` es el TTL del sistema (`systems.access_token_ttl_seconds`), limitado por `JWT_MAX_TTL_SECONDS`.
- Contraseña incorrecta, usuario inexistente o inactivo, y usuario sin asignación al sistema responden el mismo `401 INVALID_CREDENTIALS`. Siempre se hace una verificación Argon2, aunque el usuario no exista, para no revelar la causa por tiempo de respuesta.
- No hay revocación inmediata: un token emitido sigue siendo válido para el Gateway y los servicios hasta `exp` (como máximo 15 minutos con la configuración por defecto). Las rutas administrativas de Auth sí comprueban en la base que el usuario siga activo y conserve el rol ADMIN.

## Usuarios y eventos

`UsersService` (`src/users`) crea y actualiza usuarios. Cada cambio se guarda en una sola transacción junto con sus asignaciones, el incremento de `version`, la fila de `auth_audit_log` y, si cambia el snapshot público, el evento `UserCreated`/`UserUpdated` en `outbox_events`. El evento se valida con `ajv` contra `src/events/schemas/`, copia de `contracts/events/`; una prueba unitaria falla si las copias dejan de coincidir con el original, así que al cambiar un contrato hay que copiar de nuevo ambos archivos.

Las contraseñas se guardan con Argon2id y nunca aparecen en respuestas, eventos, auditoría ni logs.

## Ejecución

```bat
npm run start:dev
```

Endpoints disponibles:

- `GET http://localhost:3001/health/live`
- `GET http://localhost:3001/health/ready` (503 si PostgreSQL no responde)
- `GET http://localhost:3001/api/auth/openapi.json` en desarrollo
- `GET http://localhost:3001/docs` en desarrollo

Las rutas de negocio futuras quedan bajo `/api/auth`. Swagger se rechaza en producción cuando `NODE_ENV=production`.

## Validación

```bat
npm run format:check
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Las pruebas e2e requieren PostgreSQL: crean la base `auth_db_test` si no existe, la vacían y aplican todas las migraciones antes de cada ejecución. Nunca usan `auth_db`.

## Siguientes fases

El contrato está en [`docs/services/auth-service/auth-service.md`](../../../docs/services/auth-service/auth-service.md) y el avance por fases en [`auth-implementation-plan.md`](../../../docs/services/auth-service/auth-implementation-plan.md). Cada dependencia de dominio se agrega con la fase que realmente la utiliza.
