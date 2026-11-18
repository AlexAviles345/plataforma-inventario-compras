# Auth: guía de pruebas manuales

Recorrido para comprobar a mano todo lo que implementa Auth: bootstrap, login por sistema y rol, gestión de usuarios, permisos, desactivación, expiración de tokens, outbox y publicación en Kafka. Los comandos son para PowerShell en Windows (terminal integrada de VS Code) y se ejecutan desde `apps/backend/auth-service`, salvo que se indique otra carpeta.

Las respuestas siguen el [estándar común](../../standards/api-responses.md): `data` en los éxitos y `code` en los errores.

## 0. Preparación

1. **Node 24.** El publicador de Kafka usa un binario nativo que solo existe para versiones LTS de Node. Comprueba con `node -v`. Con otra versión todo funciona excepto la sección 9; arranca entonces con `OUTBOX_PUBLISHER_ENABLED=false` en `.env`.
2. **Infraestructura**, desde la raíz del repositorio:

   ```powershell
   docker compose -f docker-compose.example.yml up -d --wait postgres-auth kafka
   docker compose -f docker-compose.example.yml run --rm kafka-init
   ```

3. **Dependencias y configuración**, en `apps/backend/auth-service`:

   ```powershell
   npm ci
   npm rebuild @confluentinc/kafka-javascript
   copy .env.example .env
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Pega el valor generado en `JWT_SECRET` dentro de `.env`. Si el Gateway ya tiene uno, usa el mismo.

4. **Migraciones:**

   ```powershell
   npm run migration:run
   npm run migration:show   # debe terminar sin pendientes
   ```

## 1. Pruebas automáticas

Antes de probar a mano, confirma que todo pasa:

```powershell
npm run format:check
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Sin `KAFKA_E2E` se omiten 2 pruebas (la suite contra el broker real). Para incluirlas, con Node 24 y Kafka levantado:

```powershell
$env:KAFKA_E2E='true'; npm run test:e2e -- --runInBand; Remove-Item Env:KAFKA_E2E
```

Resultado esperado: 132 pruebas unitarias y 154 e2e, todas en verde.

## 2. Primer administrador

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL='admin@techdistribution.com'; $env:BOOTSTRAP_ADMIN_DISPLAY_NAME='Administrador'; npm run bootstrap:admin; Remove-Item Env:BOOTSTRAP_ADMIN_*
```

- Pide la contraseña dos veces sin mostrarla. Usa una de 8 o más caracteres que no sea común, por ejemplo `Admin-Seguro-2026`.
- Si pones una contraseña común (`password123`) la rechaza.
- **Idempotencia:** ejecútalo otra vez. Debe terminar con código 0 indicando que ya existe un ADMIN activo, sin pedir contraseña.
- **Por tubería** (automatización): `'Admin-Seguro-2026' | npm run bootstrap:admin`. Avisa que lee desde la entrada estándar y pide la contraseña una sola vez.

## 3. Arrancar el servicio

```powershell
npm run start:dev
```

En otra terminal:

```powershell
Invoke-RestMethod http://localhost:3001/health/live
Invoke-RestMethod http://localhost:3001/health/ready
```

Swagger queda en <http://localhost:3001/docs>. Todo lo de esta guía también se puede hacer desde ahí: haz login, copia `accessToken` y pégalo en **Authorize**.

## 4. Ayudantes de PowerShell

Pega esto en la terminal donde vas a probar. `Api` imprime el código HTTP y el cuerpo, también cuando la respuesta es un error.

```powershell
$Base = 'http://localhost:3001/api/auth'

function Api($Method, $Path, $Body, $Token) {
  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 6 } else { $null }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri "$Base$Path" `
      -Headers $headers -ContentType 'application/json' -Body $json
    Write-Host "HTTP $($r.StatusCode)" -ForegroundColor Green
    $r.Content | ConvertFrom-Json
  } catch {
    Write-Host "HTTP $([int]$_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    $_.ErrorDetails.Message | ConvertFrom-Json
  }
}

function Login($Email, $Password, $System) {
  (Api POST '/login' @{ email = $Email; password = $Password; system = $System }).data.accessToken
}

function Claims($Token) {
  $p = $Token.Split('.')[1].Replace('-', '+').Replace('_', '/')
  $p += '=' * ((4 - $p.Length % 4) % 4)
  [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)) | ConvertFrom-Json
}
```

Evita tildes y eñes en los cuerpos que envíes desde PowerShell 5.1: no siempre las codifica en UTF-8. Desde Swagger no hay problema.

## 5. Login

```powershell
$admin = Login 'admin@techdistribution.com' 'Admin-Seguro-2026' 'INVENTORY'
Claims $admin
```

| Prueba | Esperado |
| --- | --- |
| Login correcto | 200; claims `sub`, `email`, `role=ADMIN`, `system=INVENTORY`, `iss`, `aud`, `exp - iat = 900` |
| Mismo admin con `PURCHASES` | 200 con `system=PURCHASES` |
| Contraseña incorrecta | 401 `INVALID_CREDENTIALS` |
| Email inexistente | 401 `INVALID_CREDENTIALS`, mismo mensaje |
| `system = 'VENTAS'` | 400 `VALIDATION_ERROR` |

```powershell
Api POST '/login' @{ email = 'admin@techdistribution.com'; password = 'mala-clave-123'; system = 'INVENTORY' }
Api POST '/login' @{ email = 'nadie@techdistribution.com'; password = 'mala-clave-123'; system = 'INVENTORY' }
```

## 6. Gestión de usuarios

Crea un gestor de inventario y un agente de compras:

```powershell
$gestor = (Api POST '/users' @{
  email = 'Gestor@TechDistribution.com '; displayName = 'Gestor'; password = 'Gestor-Seguro-2026'
  assignments = @(@{ system = 'INVENTORY'; role = 'INVENTORY_MANAGER' })
} $admin).data
$gestor

$agente = (Api POST '/users' @{
  email = 'agente@techdistribution.com'; displayName = 'Agente'; password = 'Agente-Seguro-2026'
  assignments = @(@{ system = 'PURCHASES'; role = 'PURCHASES_AGENT' })
} $admin).data
```

Comprueba que:

- el email del gestor quedó normalizado (`gestor@techdistribution.com`) y la respuesta no trae contraseña ni hash;
- `version` es 1.

| Prueba | Comando | Esperado |
| --- | --- | --- |
| Email repetido | repetir el `POST` del gestor | 409 `EMAIL_ALREADY_EXISTS` |
| Contraseña común | `password = 'password123'` | 400 `VALIDATION_ERROR` con `COMMON_PASSWORD` |
| Rol no permitido | `INVENTORY` + `PURCHASES_AGENT` | 400 con `ROLE_NOT_ALLOWED_FOR_SYSTEM` |
| Campo desconocido | agregar `foo = 1` | 400 con `UNKNOWN_FIELD` |
| Listado | `Api GET '/users?page=1&limit=2' $null $admin` | `data` ordenado por email y `meta` con `total` y `totalPages` |
| Consulta | ``Api GET "/users/$($gestor.id)" $null $admin`` | 200 |
| Inexistente | `Api GET '/users/00000000-0000-4000-8000-000000000000' $null $admin` | 404 `RESOURCE_NOT_FOUND` |

**Concurrencia optimista.** Envía dos veces la misma actualización con `expectedVersion = 1`. La primera sube la versión a 2 y la segunda pierde:

```powershell
Api PUT "/users/$($gestor.id)" @{ expectedVersion = 1; displayName = 'Gestor principal' } $admin
Api PUT "/users/$($gestor.id)" @{ expectedVersion = 1; displayName = 'Otro nombre' } $admin   # 409 VERSION_CONFLICT
```

**Login por rol:**

```powershell
$tGestor = Login 'gestor@techdistribution.com' 'Gestor-Seguro-2026' 'INVENTORY'
(Claims $tGestor).role                                            # INVENTORY_MANAGER
Login 'gestor@techdistribution.com' 'Gestor-Seguro-2026' 'PURCHASES'   # 401: sin asignación
$tAgente = Login 'agente@techdistribution.com' 'Agente-Seguro-2026' 'PURCHASES'
(Claims $tAgente).role                                            # PURCHASES_AGENT
```

## 7. Aislamiento de permisos

| Prueba | Comando | Esperado |
| --- | --- | --- |
| Sin token | `Api GET '/users'` | 401 `AUTHENTICATION_REQUIRED` |
| Token alterado | `Api GET '/users' $null ($admin + 'x')` | 401 `INVALID_TOKEN` |
| Rol no ADMIN | `Api GET '/users' $null $tGestor` | 403 `FORBIDDEN` |
| Otro rol no ADMIN | `Api GET '/systems' $null $tAgente` | 403 `FORBIDDEN` |
| ADMIN de PURCHASES | `Api GET '/users' $null (Login 'admin@techdistribution.com' 'Admin-Seguro-2026' 'PURCHASES')` | 200 |

## 8. Desactivación y último administrador

```powershell
$v = (Api GET "/users/$($agente.id)" $null $admin).data.version
Api PUT "/users/$($agente.id)" @{ expectedVersion = $v; active = $false } $admin
Login 'agente@techdistribution.com' 'Agente-Seguro-2026' 'PURCHASES'   # 401 INVALID_CREDENTIALS
```

`$tAgente`, emitido antes de desactivarlo, sigue siendo un JWT válido hasta `exp`: el Gateway lo aceptaría. Así está definido en el contrato. Las rutas ADMIN de Auth sí lo revisan contra la base.

**Admin desactivado pierde acceso inmediato a Auth:**

```powershell
$admin2 = (Api POST '/users' @{
  email = 'admin2@techdistribution.com'; displayName = 'Admin 2'; password = 'Admin2-Seguro-2026'
  assignments = @(@{ system = 'INVENTORY'; role = 'ADMIN' })
} $admin).data
$tAdmin2 = Login 'admin2@techdistribution.com' 'Admin2-Seguro-2026' 'INVENTORY'
Api PUT "/users/$($admin2.id)" @{ expectedVersion = 1; active = $false } $admin
Api GET '/users' $null $tAdmin2    # 401 INVALID_TOKEN
```

**Último ADMIN activo.** El usuario del bootstrap es ahora el único ADMIN activo. Intenta desactivarlo:

```powershell
$me = (Claims $admin).sub
$v = (Api GET "/users/$me" $null $admin).data.version
Api PUT "/users/$me" @{ expectedVersion = $v; active = $false } $admin   # 409 LAST_ACTIVE_ADMIN
```

Quitarle todas las asignaciones ADMIN (`assignments = @()`) también responde 409.

## 9. Expiración del token

Baja el TTL de INVENTORY a 60 segundos:

```powershell
$inv = (Api GET '/systems' $null $admin).data | Where-Object code -eq 'INVENTORY'
Api PUT '/systems/INVENTORY' @{ expectedVersion = $inv.version; accessTokenTtlSeconds = 60 } $admin
$corto = Login 'admin@techdistribution.com' 'Admin-Seguro-2026' 'INVENTORY'
$c = Claims $corto; $c.exp - $c.iat         # 60
Start-Sleep 65
Api GET '/users' $null $corto                # 401 INVALID_TOKEN
```

Si lo intentas con `accessTokenTtlSeconds = 901` o `0`, responde 400. Al terminar, restaura el valor (usa un token nuevo, porque `$admin` puede haber vencido):

```powershell
$admin = Login 'admin@techdistribution.com' 'Admin-Seguro-2026' 'INVENTORY'
$inv = (Api GET '/systems' $null $admin).data | Where-Object code -eq 'INVENTORY'
Api PUT '/systems/INVENTORY' @{ expectedVersion = $inv.version; accessTokenTtlSeconds = 900 } $admin
```

## 10. Outbox, auditoría y secretos

Abre psql:

```powershell
docker exec -it auth-db psql -U auth_user -d auth_db
```

```sql
-- Un evento por cambio público, en orden de versión por usuario.
SELECT aggregate_id, entity_version, event_type, status, attempt_count, published_at
  FROM outbox_events ORDER BY aggregate_id, entity_version;

-- Auditoría sin credenciales.
SELECT action, target_type, target_key, target_version, details, created_at
  FROM auth_audit_log ORDER BY created_at;

-- Deben devolver 0: ni el hash ni las contraseñas usadas aparecen en eventos o auditoría.
SELECT count(*) FROM outbox_events
 WHERE payload::text ILIKE '%password%' OR payload::text LIKE '%$argon2%'
    OR payload::text LIKE '%-Seguro-2026%';
SELECT count(*) FROM auth_audit_log
 WHERE details::text LIKE '%$argon2%' OR details::text LIKE '%-Seguro-2026%';
```

Qué observar:

- **Cambio de contraseña:** sube la versión y se audita como `{"changes": ["password"]}`, sin el valor, pero no genera evento.
- **Correlación:** `correlation_id` coincide con el `X-Request-Id` de la petición. Si envías tu propio `X-Request-Id` (un UUID) en la cabecera, lo verás en el evento y en la auditoría.

## 11. Kafka

En otra terminal, deja un consumidor leyendo el tópico:

```powershell
docker exec -it kafka-broker kafka-console-consumer --bootstrap-server kafka:29092 --topic auth.users.events --from-beginning --property print.key=true --property print.partition=true --property key.separator=" | "
```

Verás los eventos ya creados: la key es el id del usuario y el valor es el JSON del evento. Todas las versiones de un mismo usuario salen en la misma partición y en orden. Si el consumidor no muestra nada, revisa que el servicio corra con Node 24 y `OUTBOX_PUBLISHER_ENABLED=true`.

**Kafka caído:**

1. Detén el broker: `docker stop kafka-broker`.
2. Crea o modifica un usuario. El HTTP responde normal y `/health/ready` sigue en 200.
3. En psql, el evento queda en `PENDING`:
   - Si el productor ya estaba conectado, `attempt_count` sube y `next_attempt_at` se aleja (1 s, 2 s, 4 s… hasta 5 min).
   - `last_error` muestra la causa, sin el contenido del evento.
4. El log del servicio muestra líneas JSON con `"type":"kafka"`.
5. Levanta el broker: `docker start kafka-broker`. Espera a que esté sano.
6. En el siguiente reintento el evento pasa a `PUBLISHED` y aparece en el consumidor. Si el backoff ya llegó a varios minutos, tarda eso como máximo.

**Publicador desactivado:** con `OUTBOX_PUBLISHER_ENABLED=false`, los eventos se acumulan en `PENDING`. Al reactivarlo y reiniciar el servicio, salen todos en orden.

## 12. Limpieza

- Para dejar Auth limpio sin borrar la base, desactiva los usuarios de prueba con `PUT ... active = $false`, porque no hay borrado físico.
- Para empezar de cero, desde la raíz:

  ```powershell
  docker compose -f docker-compose.example.yml rm -sf postgres-auth
  docker volume rm plataforma-inventario-compras_auth_pg_data
  docker compose -f docker-compose.example.yml up -d --wait postgres-auth
  ```

  Esto borra todos los datos de Auth. Después vuelve al paso 0.4 y al bootstrap.
