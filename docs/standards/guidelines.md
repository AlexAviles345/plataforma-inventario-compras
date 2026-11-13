# Contratos y reglas de implementación

## HTTP y autenticación

Todas las rutas de negocio conservan el prefijo `/api/<dominio>` tanto en el Gateway como en el servicio destino. No hay reescritura ni registro público. El único endpoint de negocio sin credencial en el MVP actual es `POST /api/auth/login`; los esquemas OpenAPI exactos son públicos solo en desarrollo. [Matriz de rutas y configuración](../services/api-gateway/api-gateway.md).

Todas las respuestas JSON de negocio cumplen el [estándar de respuestas HTTP](api-responses.md): envoltura única, status HTTP coherente, errores con código estable y paginación común. El Gateway conserva las respuestas de dominio y solo genera la envoltura cuando el error se origina en él.

Auth emite el JWT. Gateway y cada servicio verifican firma HS256, algoritmo permitido, emisor `techdistribution-auth`, audiencia `techdistribution-api`, expiración y contrato completo conforme al [estándar de tokens y sesiones](jwt-and-sessions.md). Cada servicio aplica además el RBAC y restricciones del recurso. `Authorization` se conserva; los headers `x-user-*` solo son contexto derivado, nunca una prueba de autenticación. Las aplicaciones de dominio quedan en red privada. El Gateway elimina los headers entrantes `x-user-*`, `x-forwarded-*` y `Forwarded`; no confía en proxies externos por defecto.

Payload de acceso obligatorio, además de `iss` y `aud`:

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

`sub` es UUID y coincide con el identificador publicado por Kafka. `role` es singular: `ADMIN`, `INVENTORY_MANAGER` o `PURCHASES_AGENT`. `system` es `INVENTORY` o `PURCHASES`: incluso un administrador necesita un token del sistema destino. El Gateway deriva `x-user-roles` como array JSON de un elemento, por compatibilidad con el nombre del header, y agrega `x-user-id` y `x-user-system`. No se acepta un claim `roles` como sustituto de `role`.

`iat` y `exp` son enteros positivos en segundos UTC; `exp > iat`, no expirado y duración máxima de 900 segundos por defecto (`JWT_MAX_TTL_SECONDS`, hasta 3600). `iat` permite hasta 30 segundos de adelanto de reloj. Auth configura por sistema una duración menor o igual al límite común y los hosts sincronizan reloj. Refresh no está habilitado en el MVP: se vuelve a autenticar al expirar. Su contrato futuro ya está definido y establece una credencial opaca que solo Auth interpreta; los servicios de dominio nunca la aceptan. No registrar tokens, contraseñas ni hashes en logs/eventos.

| Operación | ADMIN | INVENTORY_MANAGER | PURCHASES_AGENT |
| --- | --- | --- | --- |
| Administrar usuarios y sistemas en Auth | Sí | No | No |
| Consultar/crear/editar productos con token INVENTORY | Sí | Sí | No |
| Consultar/crear/editar/enviar/cancelar órdenes con token PURCHASES | Sí, todas | No | Sí, solo propias |

El usuario tiene asignaciones `{ system, role }`, una por sistema, y Auth verifica esa asignación al emitir cada token. `ADMIN` puede asignarse a ambos sistemas; los otros roles solo al suyo. Usuario inactivo no inicia sesión. Un servicio que ya recibió su desactivación lo rechaza. Un JWT previo puede seguir siendo utilizable mientras llega el evento, con un máximo de vigencia del token. No se promete revocación instantánea entre servicios. Rotar el secreto coordinadamente en todos los validadores invalida los tokens anteriores; una futura rotación gradual requiere claves identificadas y preferentemente firma asimétrica.

## Independencia y eventos

Los servicios de dominio no se consultan por HTTP ni acceden a bases ajenas. El tráfico cliente→Gateway→servicio, esquemas OpenAPI y comprobaciones operativas quedan fuera de esta prohibición. Kafka sincroniza proyecciones; el Gateway no consume eventos ni se conecta a las bases.

Solo el propietario modifica entidades principales. La aplicación de negocio lee sus proyecciones; únicamente sus consumidores y procesos de reconstrucción pueden escribirlas. El publicador confirma entidad + outbox en la misma transacción. El consumidor confirma proyección + deduplicación en otra transacción local antes de confirmar offsets. [Protocolo de entrega, recuperación y grupos](../architecture/event-driven-communication.md).

Los contratos versionados están en [contracts](../../contracts/events). Todos los eventos son snapshots completos de la entidad pública, identificados por `eventId`, con `schemaVersion: 1`, `entityVersion` monotónica, `aggregateId`, `timestamp` UTC y `correlationId`. La key Kafka es `aggregateId`; el publicador mantiene orden por agregado. `data.userId` o `data.productId` coincide con `aggregateId`. Kafka ordena dentro de una partición, no garantiza por sí solo orden de negocio entre productores/reintentos.

## Persistencia, concurrencia y configuración

Identificadores UUID en los tres stacks. Fechas UTC ISO 8601. Cantidades de productos y compras: enteros positivos en piezas; stock admite cero. Dinero: decimal exacto, nunca float binario. Escrituras concurrentes con versión esperada y conflicto 409, sin actualizaciones perdidas.

Cada servicio debe incluir README, pruebas, migraciones versionadas y ejemplo de configuración sin secretos. Node/Python: `.env.example`; Spring: `application.yml` con placeholders y `application-local.yml` ignorado. El ejemplo Compose es exclusivamente local y sus credenciales son de demostración. La configuración reproducible se versiona; los secretos reales no. En despliegues accesibles, TLS termina en [Nginx como capa edge](../infrastructure/nginx-edge.md); solo 80/443 son públicos y los puertos de frontend, Gateway, servicios y datos permanecen privados. El Gateway actual usa un límite de login en memoria por instancia; escalar requiere almacenamiento compartido y una política explícita que confíe únicamente en el proxy Nginx conocido.

GitHub Actions y el futuro [Jenkins conectado con GitHub](../infrastructure/jenkins-github.md) usan pipelines versionados, checks con nombres únicos y credenciales de mínimo privilegio. Pull requests no confiables nunca reciben secretos de despliegue. Las imágenes se construyen una vez, se identifican por digest y se promueven entre ambientes sin reconstrucción.

Cada escritura HTTP propaga un `X-Request-Id` generado por el Gateway; Auth/Inventory lo copian como `correlationId` al outbox. Logs estructurados incluyen servicio, requestId/eventId, resultado y duración, sin datos de autenticación. Medir latencia/errores HTTP, backlog del outbox, lag Kafka y DLQ. Readiness del Gateway solo comprueba su propio arranque, no certifica disponibilidad de los dominios.
