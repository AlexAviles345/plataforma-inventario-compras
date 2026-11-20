# Auth Service

Servicio de autenticación de TechDistribution. Usa NestJS 11, Node 24, npm 11, PostgreSQL y TypeORM 1.x e implementa usuarios, sistemas, access tokens JWT, sesiones renovables y publicación Kafka.

## Requisitos

- Node.js 24.11 o posterior dentro de la rama 24.x (mínimo exigido por TypeORM 1.x). Es obligatorio para el publicador de Kafka: `@confluentinc/kafka-javascript` solo publica binarios precompilados para versiones LTS de Node, y en otras versiones no carga.
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

| Variable                              | Por defecto fuera de producción              | Uso                                                               |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `PORT`                                | 3001                                         | Puerto HTTP                                                       |
| `NODE_ENV`                            | development                                  | `development`, `test` o `production`                              |
| `DOCS_ENABLED`                        | true (false en producción)                   | Swagger y OpenAPI; prohibido en producción                        |
| `DB_HOST` / `DB_PORT`                 | 127.0.0.1 / 5432                             | Servidor PostgreSQL                                               |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | auth_db / auth_user / auth_password          | Credenciales de demostración del Compose                          |
| `DB_POOL_MAX`                         | 10                                           | Conexiones máximas del pool (1–100)                               |
| `DB_TEST_NAME`                        | auth_db_test                                 | Base de las pruebas e2e; debe terminar en `_test`                 |
| `JWT_SECRET`                          | **ninguno, obligatorio**                     | Secreto HS256 de al menos 32 bytes; el mismo del Gateway          |
| `JWT_ISSUER` / `JWT_AUDIENCE`         | techdistribution-auth / techdistribution-api | Deben coincidir con el Gateway y los servicios                    |
| `JWT_MAX_TTL_SECONDS`                 | 900                                          | Vigencia máxima del access token (1–3600)                         |
| `REFRESH_TOKEN_TTL_SECONDS`           | 604800                                       | Vigencia absoluta de la sesión renovable (1–2592000)              |
| `REFRESH_COOKIE_SECURE`               | false (true y obligatorio en producción)     | Envía cookies únicamente por HTTPS fuera de desarrollo local      |
| `KAFKA_BOOTSTRAP_SERVERS`             | 127.0.0.1:9092 (obligatorio en producción)   | Brokers `host:puerto` separados por comas                         |
| `OUTBOX_PUBLISHER_ENABLED`            | true                                         | `false` deja los eventos acumulados en el outbox                  |
| `OUTBOX_POLL_INTERVAL_MS`             | 1000                                         | Pausa entre rondas del publicador cuando no hay trabajo (1–60000) |

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

- Responde `{accessToken, tokenType: "Bearer", expiresIn}` con `Cache-Control: no-store`. Además crea una familia de sesión y entrega `td_refresh` como cookie `HttpOnly` y `td_csrf` como cookie legible para double-submit CSRF; el refresh token nunca aparece en JSON.
- `POST /api/auth/refresh` rota una sola vez ambos secretos y conserva la expiración absoluta. `POST /api/auth/logout` revoca la familia y limpia las cookies.
- `expiresIn` es el TTL del sistema (`systems.access_token_ttl_seconds`), limitado por `JWT_MAX_TTL_SECONDS`.
- Contraseña incorrecta, usuario inexistente o inactivo, y usuario sin asignación al sistema responden el mismo `401 INVALID_CREDENTIALS`. Siempre se hace una verificación Argon2, aunque el usuario no exista, para no revelar la causa por tiempo de respuesta.
- Logout, cambio de contraseña, desactivación o cambio de asignación revocan las familias afectadas e impiden nuevas renovaciones. Un access token ya emitido sigue siendo válido para el Gateway y los servicios hasta `exp` (como máximo 15 minutos con la configuración por defecto).

## Usuarios y eventos

`UsersService` (`src/users`) crea y actualiza usuarios. Cada cambio se guarda en una sola transacción junto con sus asignaciones, el incremento de `version`, la fila de `auth_audit_log` y, si cambia el snapshot público, el evento `UserCreated`/`UserUpdated` en `outbox_events`. El evento se valida con `ajv` contra `src/events/schemas/`, copia de `contracts/events/`; una prueba unitaria falla si las copias dejan de coincidir con el original, así que al cambiar un contrato hay que copiar de nuevo ambos archivos.

Las contraseñas se guardan con Argon2id y nunca aparecen en respuestas, eventos, auditoría ni logs.

## Publicación en Kafka

El servicio publica `outbox_events` en `auth.users.events` (`src/outbox/`). La key es el UUID del usuario y el valor es el evento JSON completo.

- **Orden:** cada ronda reclama solo el evento no publicado de menor versión de cada usuario. Hay como máximo un envío en curso por usuario, y la versión siguiente espera a que la anterior quede `PUBLISHED`. Varias réplicas pueden convivir: el reclamo es un `UPDATE` condicional con lease de 60 s.
- **Entrega:** el productor es idempotente con `acks=all`. Un evento queda `PUBLISHED` solo tras el acknowledgement. Si el proceso cae antes de marcarlo, el lease vence y se reenvía el mismo `eventId`; los consumidores lo deduplican.
- **Fallos:**
  - Un envío fallido vuelve a `PENDING` con backoff exponencial y jitter (1 s, 2 s, 4 s… hasta 5 min), sin límite de intentos y con un `last_error` saneado.
  - Con Kafka caído, el HTTP funciona igual. El productor reintenta conectar en segundo plano y los eventos esperan sin gastar intentos.
- **Retención:** las filas publicadas se borran a los 30 días.
- **Binario nativo:** `npm ci --ignore-scripts` no descarga el binario de librdkafka. Tras instalar, ejecuta una vez `npm rebuild @confluentinc/kafka-javascript`, como hacen el Dockerfile y CI. Si tu Node no es 24.x, arranca con `OUTBOX_PUBLISHER_ENABLED=false`.
- **Pruebas contra un broker real:** se activan con `KAFKA_E2E=true`. Requieren Kafka con los tópicos creados (`docker compose -f docker-compose.example.yml up -d --wait kafka` y luego `run --rm kafka-init`) y el binario nativo.

## Ejecución

```bat
npm run start:dev
```

Endpoints disponibles:

- `GET http://localhost:3001/health/live`
- `GET http://localhost:3001/health/ready` (503 si PostgreSQL no responde)
- `GET http://localhost:3001/api/auth/openapi.json` en desarrollo
- `GET http://localhost:3001/docs` en desarrollo

Rutas de negocio bajo `/api/auth`:

| Ruta                      | Acceso  | Respuesta                                                                   |
| ------------------------- | ------- | --------------------------------------------------------------------------- |
| `POST /login`             | Público | 200 token; 401 `INVALID_CREDENTIALS`                                        |
| `POST /refresh`           | Cookie + CSRF | Rota la sesión; 401 `INVALID_REFRESH_TOKEN` o 403 `CSRF_VALIDATION_FAILED` |
| `POST /logout`            | Cookie + CSRF | Revoca y limpia cookies; idempotente                                        |
| `POST /users`             | ADMIN   | 201 + `Location`; 409 `EMAIL_ALREADY_EXISTS`                                |
| `GET /users?page=&limit=` | ADMIN   | Lista paginada ordenada por email (`limit` ≤ 100)                           |
| `GET /users/stats`        | ADMIN   | Estadísticas agregadas de usuarios activos, inactivos y asignaciones        |
| `GET /users/{id}`         | ADMIN   | 200; 404 si no existe                                                       |
| `PUT /users/{id}`         | ADMIN   | Parcial con `expectedVersion`; 409 `VERSION_CONFLICT` o `LAST_ACTIVE_ADMIN` |

Las rutas ADMIN aceptan un token ADMIN de cualquiera de los dos sistemas. Swagger documenta la envoltura completa y un ejemplo por cada código de error; se rechaza en producción cuando `NODE_ENV=production`.

## Validación

```bat
npm run format:check
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run audit:production
```

Las pruebas e2e requieren PostgreSQL: crean la base `auth_db_test` si no existe, la vacían y aplican todas las migraciones antes de cada ejecución. Nunca usan `auth_db`.

`audit-ci.jsonc` mantiene una excepción temporal y con vencimiento el 18 de diciembre de 2026 para `GHSA-fc5q-39xc-vjpf`. TypeORM todavía depende de `tinyglobby` y una rama vulnerable de `picomatch`, pero Auth registra entidades y migraciones mediante listas explícitas de clases, sin patrones glob configurables ni entrada de clientes en esa resolución. Cualquier otra vulnerabilidad alta o crítica continúa rompiendo CI. La excepción debe retirarse cuando exista una versión corregida; no ejecutar `npm audit fix --force`, porque propone una degradación incompatible de TypeORM.

Para recorrer a mano cada funcionalidad (login, permisos, desactivación, expiración, outbox y Kafka caído) sigue la [guía de pruebas manuales](../../../docs/services/auth-service/auth-manual-testing.md).

## Siguientes fases

El contrato está en [`docs/services/auth-service/auth-service.md`](../../../docs/services/auth-service/auth-service.md) y el avance por fases en [`auth-implementation-plan.md`](../../../docs/services/auth-service/auth-implementation-plan.md). Cada dependencia de dominio se agrega con la fase que realmente la utiliza.
