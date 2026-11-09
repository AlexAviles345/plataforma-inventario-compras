# API Gateway

NestJS 11; Node 24.9+ de la rama 24.x y npm 11.x (versiones verificadas por engines y `.nvmrc`). Proxy HTTP para Auth, Inventory y Purchases. [Contrato de rutas y seguridad](../.docs/services/api-gateway.md).

## Inicialización

```powershell
cd api-gateway
npm ci --ignore-scripts
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Coloca el valor generado en JWT_SECRET de `.env` y compártelo por un canal seguro con Auth y validadores. El placeholder se rechaza al iniciar. En Bash usa `cp .env.example .env`. Las URLs son orígenes sin path: Auth 3001, Inventory 8081, Purchases 8000. Configura emisor, audiencia y TTL máximo iguales en todos los servicios. CORS_ORIGINS acepta orígenes separados por comas.

```bash
npm run start:dev
# Producción
npm run build
npm run start:prod
```

En producción define NODE_ENV=production y DOCS_ENABLED=false; un ingress termina TLS y solo publica el Gateway. El repositorio incluye Dockerfile; su ejecución requiere las mismas variables y URLs accesibles desde la red del contenedor (localhost apunta al propio contenedor).

## Rutas y límites

- `POST /api/auth/login`: anónimo; 10 intentos/minuto/IP en esta instancia.
- `/api/auth/*`: JWT; Auth autoriza operaciones.
- `/api/inventory/*`, `/api/purchases/*`: JWT del sistema correspondiente; los destinos verifican JWT y permisos también.
- `GET /health/live`, `GET /health/ready`: salud del propio Gateway.
- Desarrollo: [Swagger](http://localhost:3000/docs), con esquemas `GET /api/{auth,inventory,purchases}/openapi.json`, públicos solo cuando DOCS_ENABLED=true.

Se conserva el cuerpo en streaming y se limita a MAX_BODY_BYTES (1 MiB por defecto), incluido chunked. PROXY_TIMEOUT_MS limita la operación completa (10 s). Errores propios en JSON: 401 token, 403 sistema, 413 tamaño, 429 login, 502 upstream inaccesible y 504 plazo agotado. Respuestas de dominio mantienen status/cuerpo. No hay reintentos de escrituras. Cada petición tiene X-Request-Id y log de acceso sin query ni Authorization.

No se confía en cabeceras de identidad ni IP enviadas por clientes. El limitador usa memoria; antes de múltiples instancias hace falta store compartido y una política revisada de proxies confiables.

## Validación

```bash
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm audit
```

Las pruebas HTTP levantan upstreams simulados y prueban cuerpos/rutas, JWT/claims/sistema, identidad falsificada, Swagger, fallos/timeout, tamaño, rate limit y estabilidad de listeners. No requieren bases ni Kafka. CI usa Node 24, ejecuta esos controles, construye la imagen y prueba infraestructura/Kafka por separado. La integración con los servicios de dominio queda pendiente de sus implementaciones.

Jest se ejecuta con `--experimental-vm-modules` para cargar el proxy ESM; requiere Node 24.9+ y puede emitir la advertencia experimental de Node. Los overrides de multer/glob/minimatch fijan versiones corregidas y se verifican con build, lint y pruebas; revisarlos al actualizar sus dependencias padre.

La auditoría actual deja ocho entradas de severidad baja exclusivamente de desarrollo, todas por `deepmerge` 4.3.1 en Jest/CLI ([advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)). El paquete todavía no publica una versión corregida. No pasar configuración no confiable a esas herramientas; revisar la alerta al actualizar. La auditoría de producción debe permanecer sin vulnerabilidades; no degradar Jest/Nest a versiones antiguas para silenciarla.
