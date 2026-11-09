# Nginx como capa edge

Estado: arquitectura futura, todavía no implementada. Nginx será el único punto
HTTP(S) publicado en un despliegue accesible y permanecerá delante del frontend y
del API Gateway. No sustituye al Gateway ni se comunica directamente con Auth,
Inventory o Purchases.

```text
Cliente
  |
  v
Nginx :80/:443
  |-- /                     --> frontend
  |-- /api/**               --> API Gateway :3000 --> microservicios
  |-- /health/**            --> API Gateway :3000
  `-- /docs                 --> API Gateway :3000 (solo desarrollo)
```

## Responsabilidades

Nginx se encarga de:

- terminar TLS y redirigir HTTP a HTTPS;
- servir assets estáticos o enrutar al servidor del frontend;
- comprimir y cachear únicamente contenido estático seguro;
- aplicar headers de seguridad del borde;
- enrutar `/api/**`, salud y documentación hacia el Gateway;
- mantener ocultos los puertos internos;
- soportar WebSocket/upgrade cuando una funcionalidad futura lo necesite.

El API Gateway continúa encargado de:

- validar access tokens y sistema destino;
- eliminar identidad falsificada y construir contexto confiable;
- aplicar CORS, límites de body, timeout y rate limiting de autenticación;
- generar `X-Request-Id` y respuestas de error normalizadas;
- enrutar hacia Auth, Inventory y Purchases.

Nginx nunca interpreta JWT, refresh tokens, roles ni reglas de dominio. Tampoco
vuelve a envolver respuestas JSON. CORS se configura en un solo lugar: el Gateway.

## Red y exposición

- Solo Nginx publica 80/443 en producción.
- Frontend, Gateway y microservicios viven en redes privadas de Compose u otra
  plataforma de despliegue.
- Auth, Inventory, Purchases, bases de datos y Kafka no se exponen a Internet.
- En desarrollo sin Nginx, los puertos pueden publicarse únicamente en loopback.
- `/docs` y esquemas OpenAPI permanecen deshabilitados en producción.

## Headers y proxies confiables

Nginx reemplaza, no concatena ciegamente, los headers recibidos del cliente y
envía al Gateway al menos `Host`, `X-Real-IP`, `X-Forwarded-For` y
`X-Forwarded-Proto` con valores derivados de la conexión real.

El Gateway actual usa `trust proxy: false` y elimina todos los headers Forwarded.
Antes de colocar Nginx delante se debe cambiar esa política para confiar únicamente
en la red o salto conocido de Nginx. Nunca se usa `trust proxy: true` sin una lista
de proxies confiables, porque permitiría falsificar IP, protocolo y rate limiting.

`X-Request-Id` sigue siendo generado por el Gateway. Nginx lo devuelve sin
reemplazarlo cuando recibe la respuesta. Los logs de Nginx incluyen ese valor para
correlacionarse con Gateway y servicios.

## TLS, cookies y sesiones

- TLS termina en Nginx con protocolos y suites mantenidos por la plataforma.
- Certificados y claves son secretos externos; no se versionan en el repositorio.
- `X-Forwarded-Proto: https` debe llegar de manera confiable al Gateway.
- Nginx conserva `Set-Cookie` para `td_refresh` y `td_csrf` sin eliminar flags.
- Cookies `Secure` solo viajan por HTTPS; el perfil local debe documentar cualquier
  excepción para localhost.
- Cambiar dominio, path o SameSite mediante Nginx requiere revisar el
  [contrato de sesiones](../standards/jwt-and-sessions.md); no se reescriben cookies
  por conveniencia.

## Límites y timeouts

Los límites del borde se coordinan con el Gateway:

- El timeout de lectura de Nginx debe ser ligeramente mayor que
  `PROXY_TIMEOUT_MS`, para que el Gateway produzca primero su error 504 estándar.
- El límite de body de Nginx debe permitir que el Gateway aplique
  `MAX_BODY_BYTES`, o Nginx debe tener una respuesta JSON compatible para su 413.
- Nginx no reintenta automáticamente operaciones de escritura.
- Caching está deshabilitado para `/api/**`, respuestas autenticadas y cookies.
- Rate limiting de borde complementa, pero no reemplaza, el control de login y
  refresh del Gateway/Auth.

## Desarrollo y Compose

Se mantendrán dos recorridos:

1. `npm run dev`: infraestructura en contenedores y aplicaciones locales con hot
   reload; Nginx opcional para el ciclo rápido.
2. `npm run dev:edge`: entorno completo con Nginx para comprobar rutas, cookies,
   headers y comportamiento equivalente al despliegue.

El futuro `docker-compose.dev.yml` podrá usar perfiles:

- `apps`: Gateway y microservicios.
- `frontend`: aplicación web.
- `edge`: Nginx; depende de Gateway y frontend.
- `tools`: utilidades administrativas opcionales.

Ejemplo del comando previsto, todavía no disponible:

```bash
docker compose -f docker-compose.dev.yml --profile apps --profile frontend --profile edge up --build --watch
```

Los servicios de datos esenciales no deben quedar detrás de perfiles opcionales.
El archivo actual `docker-compose.example.yml` sigue dedicado a infraestructura
local hasta que los dominios tengan persistencia implementada.

## Jenkins administrativo

La futura integración de [Jenkins con GitHub](jenkins-github.md) no comparte el
virtual host de la aplicación. Si Nginx publica Jenkins, usa un dominio y una red
administrativa separados; la UI queda restringida y solo el endpoint de webhook
necesario es accesible desde GitHub. Jenkins no atraviesa el API Gateway ni forma
parte del Compose runtime de la plataforma.

## Aceptación antes de producción

1. Solo 80/443 son accesibles desde fuera de la red privada.
2. `/` entrega el frontend y `/api/**` atraviesa Gateway sin reescrituras.
3. Status, body, headers y cookies de los servicios sobreviven ambos proxies.
4. IP y protocolo reales solo pueden provenir del Nginx confiable.
5. CORS no se duplica y nunca combina credenciales con origen comodín.
6. 401/403/413/429/502/504 conservan el contrato JSON acordado.
7. `X-Request-Id` aparece en Nginx, Gateway y servicio destino.
8. Refresh y logout funcionan con cookies Secure y CSRF a través de Nginx.
9. Timeouts no provocan que Nginx oculte prematuramente el error del Gateway.
10. Assets estáticos se cachean; `/api/**` y respuestas autenticadas no.
