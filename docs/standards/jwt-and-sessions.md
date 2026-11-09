# Estándar de access tokens, refresh tokens y sesiones

Este documento define las credenciales de autenticación de TechDistribution. El
access token es el contrato vigente del MVP. El refresh token queda especificado
para una ampliación posterior, pero todavía no está implementado ni habilitado en
el Gateway.

## Separación de responsabilidades

| Credencial | Formato | Quién la emite | Quién la valida | Uso |
| --- | --- | --- | --- | --- |
| Access token | JWT firmado | Auth | Gateway, Auth y servicio destino | Autorizar una solicitud de negocio |
| Refresh token | Secreto opaco aleatorio | Auth | Solo Auth | Renovar una sesión y emitir otro access token |

Inventory y Purchases nunca reciben, decodifican ni almacenan refresh tokens. Un
refresh token no es un Bearer token y no sirve para llamar endpoints de negocio.
Los headers `x-user-*` agregados por el Gateway son contexto derivado, no una
credencial alternativa.

## Access token

### Formato y transporte

- JWT compacto firmado con `HS256` durante el MVP.
- Header JWT con `typ: "JWT"` y `alg: "HS256"`.
- Se envía exclusivamente como `Authorization: Bearer <accessToken>`.
- No se acepta en query string, cookies ni body de endpoints protegidos.
- Ningún validador toma el algoritmo desde el token como configuración: permite
  explícitamente solo `HS256`.
- Auth, Gateway y servicios comparten emisor, audiencia y secreto mediante
  configuración segura; el secreto no se versiona ni se registra.

Una migración futura a firma asimétrica debe definir `kid`, publicación de claves,
rotación y periodo de convivencia. No se mezclan algoritmos sin ese procedimiento.

### Claims obligatorios

```json
{
  "sub": "767cc714-0614-4ab9-9510-c4772b403fed",
  "email": "usuario@techdistribution.com",
  "role": "INVENTORY_MANAGER",
  "system": "INVENTORY",
  "iat": 1794182400,
  "exp": 1794183300,
  "iss": "techdistribution-auth",
  "aud": "techdistribution-api"
}
```

| Claim | Regla |
| --- | --- |
| `sub` | UUID del usuario; coincide con el identificador publicado por Auth |
| `email` | Email normalizado y sintácticamente válido |
| `role` | `ADMIN`, `INVENTORY_MANAGER` o `PURCHASES_AGENT` |
| `system` | `INVENTORY` o `PURCHASES` |
| `iat` | Entero positivo en segundos UTC; no más de 30 segundos en el futuro |
| `exp` | Entero UTC mayor que `iat` y que la hora actual |
| `iss` | Exactamente `techdistribution-auth` |
| `aud` | Exactamente `techdistribution-api` |

`role` es singular. No se acepta `roles` como sustituto. Las combinaciones
permitidas son:

- `ADMIN` con `INVENTORY` o `PURCHASES`.
- `INVENTORY_MANAGER` únicamente con `INVENTORY`.
- `PURCHASES_AGENT` únicamente con `PURCHASES`.

Incluso un administrador necesita un access token del sistema destino. El token
no concede por sí solo acceso a un recurso: cada servicio aplica también RBAC,
propiedad, estado del usuario y reglas del dominio.

### Vigencia

- `exp - iat` no supera `JWT_MAX_TTL_SECONDS`.
- El valor predeterminado es 900 segundos y el máximo configurable es 3600.
- Cada sistema puede configurar un TTL menor, nunca uno superior al límite común.
- Los hosts mantienen sus relojes sincronizados.
- No hay revocación instantánea del access token en el MVP. Una desactivación,
  cambio de contraseña o cierre de sesión impide nuevas emisiones, pero un token
  emitido puede vivir hasta `exp`.

La duración corta del access token limita esa ventana. No se consulta a Auth por
HTTP para validar cada solicitud.

### Validación obligatoria

Gateway y servicio destino validan independientemente:

1. formato JWT y firma;
2. algoritmo permitido;
3. emisor y audiencia exactos;
4. `iat`, `exp` y TTL máximo;
5. presencia y tipo de todos los claims;
6. UUID y email válidos;
7. combinación `role`/`system` permitida;
8. que `system` corresponda al servicio solicitado.

El Gateway elimina cualquier `x-user-*`, `x-forwarded-*` o `Forwarded` recibido
del cliente. Después de validar, agrega `x-user-id`, `x-user-roles` y
`x-user-system`; el servicio conserva el JWT y vuelve a validarlo.

## Refresh token y sesión renovable

### Estado de adopción

Refresh no forma parte del MVP actual. Hasta habilitar esta ampliación, al vencer
el access token el usuario vuelve a ejecutar login. Definir el contrato aquí no
autoriza todavía `/api/auth/refresh` ni `/api/auth/logout` en el Gateway.

Antes de activarlo deben implementarse en Auth el modelo de sesiones, migraciones,
rotación transaccional, cookies, CSRF, revocación y pruebas; el Gateway debe agregar
las rutas explícitas, rate limiting, CORS con credenciales y pruebas end-to-end.

### Formato y almacenamiento

- Secreto opaco producido por un generador criptográfico con al menos 256 bits de
  entropía y codificado en Base64URL sin padding.
- No es JWT y no contiene claims interpretables por el cliente.
- Auth guarda únicamente `SHA-256(refreshToken)` con restricción única. El hash
  rápido es apropiado porque la entrada es aleatoria de alta entropía; no se usa
  para contraseñas humanas.
- Nunca se almacena ni registra el token original, tampoco en auditoría, eventos,
  URLs, métricas o mensajes de error.

Cada login exitoso crea una familia de sesión con al menos:

| Campo | Propósito |
| --- | --- |
| `id` | UUID interno de la sesión |
| `familyId` | UUID común a todas las rotaciones de la sesión |
| `userId` | Propietario |
| `system` | Sistema fijo de la sesión |
| `tokenHash` | SHA-256 del refresh token vigente |
| `csrfHash` | Hash del token CSRF vigente |
| `createdAt` | Inicio UTC |
| `expiresAt` | Expiración absoluta UTC |
| `lastUsedAt` | Última rotación exitosa |
| `revokedAt` | Revocación, si existe |
| `replacedById` | Siguiente token de la rotación, si existe |

El rol no queda congelado en el refresh token. Auth consulta la asignación actual
en cada renovación y emite el access token con el rol vigente. `system` no puede
cambiarse mediante refresh; para otro sistema se realiza otro login.

### Vigencia

- `REFRESH_TOKEN_TTL_SECONDS` usa 604800 segundos (7 días) por defecto.
- El máximo permitido es 2592000 segundos (30 días).
- La expiración es absoluta desde el login. Rotar no extiende `expiresAt`.
- Al vencer la familia se requiere login, aunque el último token haya sido usado
  recientemente.

### Transporte para aplicaciones web

Auth entrega el refresh token únicamente en una cookie host-only:

```text
Set-Cookie: td_refresh=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800
```

La protección CSRF usa double-submit con una segunda cookie `td_csrf`, segura y
legible por el frontend. El cliente copia su valor al header `X-CSRF-Token`; Auth
verifica en tiempo constante cookie, header y `csrfHash` de la sesión.

- `td_refresh` siempre es `HttpOnly` y nunca aparece en el JSON.
- Ambas cookies usan `Secure` fuera de localhost.
- No se configura `Domain`; permanecen host-only.
- `SameSite=Strict` es el valor predeterminado. Cambiarlo a `None` requiere una
  revisión explícita de origen, CORS y CSRF; no es solo un cambio de configuración.
- El Gateway permite credenciales únicamente para orígenes explícitos. Nunca usa
  `Access-Control-Allow-Origin: *` junto con cookies.
- No se aceptan refresh tokens en query string, `Authorization: Bearer`, local
  storage ni headers alternativos.

Clientes nativos o integraciones no basadas en navegador requieren un perfil de
transporte separado antes de habilitarse; no se reutiliza silenciosamente el
contrato de cookies.

### Endpoints reservados

Estos endpoints se habilitan juntos cuando la ampliación esté implementada:

| Endpoint | Credencial | Comportamiento |
| --- | --- | --- |
| `POST /api/auth/refresh` | Cookies `td_refresh`, `td_csrf` y header `X-CSRF-Token` | Rota la sesión y devuelve otro access token |
| `POST /api/auth/logout` | Cookies y CSRF cuando están disponibles | Revoca la familia y limpia cookies; operación idempotente |

No requieren un access token vigente. Tampoco son anónimos: el refresh token y la
prueba CSRF son sus credenciales. El Gateway solo enruta y limita estas llamadas;
no valida ni decodifica el refresh token.

Login y refresh devuelven el access token dentro del
[estándar de respuestas](api-responses.md):

```json
{
  "error": false,
  "statusCode": 200,
  "message": "Sesión renovada exitosamente",
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

`expiresIn` expresa segundos y coincide con `exp - iat`. El refresh token rotado
se entrega solo mediante `Set-Cookie`.

### Rotación, concurrencia y reutilización

Cada refresh es de un solo uso. En una transacción con bloqueo de la sesión, Auth:

1. verifica cookie, CSRF, hash, expiración y ausencia de revocación;
2. comprueba que el usuario siga activo y conserve asignación al sistema;
3. marca el token actual como reemplazado;
4. crea el siguiente token en la misma familia, con la expiración absoluta original;
5. confirma la transacción;
6. devuelve el nuevo access token y reemplaza ambas cookies.

Dos usos simultáneos del mismo refresh token no pueden producir dos sucesores. El
primero puede completar; el segundo se considera reutilización, revoca toda la
familia y genera una alerta de seguridad saneada. Los clientes no reintentan
automáticamente un refresh cuyo resultado sea desconocido: vuelven a login.

Token ausente, inválido, vencido, revocado, reutilizado o asociado a un usuario
inactivo devuelve el mismo 401 `INVALID_REFRESH_TOKEN`, limpia las cookies y no
revela cuál comprobación falló. Un fallo CSRF devuelve 403
`CSRF_VALIDATION_FAILED`. La reutilización se registra sin incluir tokens ni hashes.

### Revocación

- Logout revoca la familia completa y limpia `td_refresh` y `td_csrf`, aun si la
  sesión ya no existe.
- Cambiar contraseña o desactivar al usuario revoca todas sus familias activas.
- Quitar o cambiar una asignación revoca las familias del sistema afectado.
- La revocación impide renovar, pero los access tokens ya emitidos conservan la
  ventana corta definida por `exp`.
- Una tarea periódica elimina tokens vencidos conforme a la política de retención
  de auditoría; nunca elimina antes la evidencia mínima necesaria para detectar
  reutilización dentro de la vigencia de la familia.

## Respuestas de autenticación

Los errores cumplen el [contrato HTTP común](api-responses.md). Mensajes de login
y refresh son deliberadamente genéricos para no revelar usuarios, asignaciones,
estado de sesión ni causa de validación. Rate limiting usa 429 `RATE_LIMITED` y
`Retry-After` cuando corresponda.

## Pruebas de aceptación

### Access token vigente

1. Auth emite todos los claims con TTL correcto.
2. Gateway y cada stack rechazan firma, algoritmo, emisor, audiencia, expiración,
   tipos o combinaciones de rol/sistema inválidas.
3. Inventory rechaza tokens PURCHASES y Purchases rechaza tokens INVENTORY.
4. Headers de identidad falsificados son eliminados.
5. Ningún log, evento o respuesta expone secretos.

### Refresh cuando se habilite

1. Auth persiste hashes, nunca tokens originales.
2. Cada uso rota token y CSRF de forma atómica.
3. Dos usos concurrentes no crean dos sesiones sucesoras.
4. Reutilización revoca la familia sin revelar la causa al cliente.
5. Expiración absoluta no se extiende con rotaciones.
6. Password, desactivación y cambios de asignación revocan las familias correctas.
7. CSRF, flags y alcance de cookies se verifican end-to-end a través del Gateway.
8. Inventory y Purchases rechazan cualquier intento de usar refresh como Bearer.
9. CORS nunca combina credenciales con un origen comodín.
10. Logout es idempotente y limpia cookies incluso para una sesión inexistente.
