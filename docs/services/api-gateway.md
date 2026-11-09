# API Gateway

NestJS 11 sobre Node 24, proxy HTTP con `http-proxy-middleware`. Reenvía streams sin parser de body y conserva URI, query, método, Authorization y bytes del cuerpo. Una instancia de proxy por servicio. Sin acceso a Kafka ni bases.

| Ruta pública e interna | Destino local | Acceso |
| --- | --- | --- |
| `POST /api/auth/login` | `http://localhost:3001` | Público; 10 intentos/minuto por IP |
| `/api/auth/*` restante | `http://localhost:3001` | JWT válido; Auth aplica permisos |
| `/api/inventory/*` | `http://localhost:8081` | JWT de INVENTORY |
| `/api/purchases/*` | `http://localhost:8000` | JWT de PURCHASES |
| `GET /api/{auth,inventory,purchases}/openapi.json` | Servicio correspondiente, misma URI | Público exclusivamente en desarrollo |
| `/docs` | UI del Gateway | Habilitada exclusivamente en desarrollo |
| `GET /health/live`, `GET /health/ready` | Gateway | Públicos; readiness del Gateway, sin sondeo de dominios |

Los tokens cumplen el [contrato de access tokens y sesiones](../standards/jwt-and-sessions.md), incluido `role` singular. Las identidades entrantes se eliminan, se derivan de claims validados y se reenvían como contexto; el destino vuelve a verificar JWT. No se confía en headers Forwarded ni se habilita `trust proxy`. No hay `/register` anónimo ni alias sin `/api`.

Refresh no está habilitado actualmente. Cuando se implemente, el Gateway permitirá explícitamente `POST /api/auth/refresh` y `POST /api/auth/logout` con cookie y CSRF, sin intentar interpretar el refresh token. También deberá habilitar credenciales CORS solo para orígenes explícitos, aplicar límites específicos y conservar `POST /api/auth/login` como la única ruta verdaderamente anónima. Inventory y Purchases nunca recibirán esa credencial.

Cada esquema debe declarar `servers: [{"url":"/"}]`, paths completos `/api/<dominio>/...` y bearer security para sus operaciones protegidas. Auth configura `jsonDocumentUrl` de Nest; Inventory configura `springdoc.api-docs.path`; Purchases registra una vista de schema de DRF en la ruta acordada. El Gateway muestra los documentos, sin inferir ni reescribir sus operaciones. Los servicios deben deshabilitar sus esquemas públicos en producción también.

Configuración validada al iniciar: ver [`.env.example`](../../apps/backend/api-gateway/.env.example). URLs de destino deben ser orígenes HTTP(S) sin credenciales ni paths. JWT_SECRET aleatorio de al menos 32 bytes. Emisor y audiencia deben coincidir en Auth y validadores. `DOCS_ENABLED` debe ser false en producción. CORS usa una lista explícita de orígenes; no reemplaza autenticación.

Plazo total por operación: 10 segundos por defecto, configurable hasta 120 segundos. Un upstream inaccesible devuelve 502 y uno que excede el plazo 504. Cuerpo máximo 1 MiB por defecto, aplicado tanto con Content-Length como chunked; 413 si se excede. No se reintentan escrituras ni se siguen redirects internos. Si ya comenzó una respuesta y ocurre un fallo/timeout se cierra la conexión; no se puede cambiar su status.

Los errores originados aquí cumplen el [estándar común](../standards/api-responses.md), usan `source: "gateway"` y un `code` estable. Los errores de dominio mantienen cuerpo y status originales, sin una segunda envoltura. `X-Request-Id` se genera por petición, se devuelve al cliente y se propaga al servicio; nunca contiene tokens. Logs de acceso estructurados indican método, ruta sin query, status, duración y requestId. El formato actual del Gateway, anterior a este estándar, debe incorporar `code` al implementar los contratos de dominio.

El limitador de login reside en memoria: una instancia para desarrollo/MVP. Antes de replicar, usar store compartido. Al agregar [Nginx como capa edge](../infrastructure/nginx-edge.md), configurar explícitamente su red o salto como proxy confiable, aceptar Forwarded solo desde allí y verificar IP/protocolo reales; no habilitar confianza global. TLS termina en Nginx y no se exponen directamente Gateway ni puertos de dominio. Los timeouts y límites del borde se coordinan para que el Gateway conserve sus errores normalizados. El [Dockerfile](../../apps/backend/api-gateway/Dockerfile) ejecuta con usuario sin privilegios y documentación deshabilitada.
