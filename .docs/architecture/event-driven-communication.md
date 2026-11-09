# Entrega de eventos y proyecciones

## Tópicos y consumidores

| Tópico | Productor | Grupos independientes |
| --- | --- | --- |
| `auth.users.events` | Auth | `inventory.auth-users.v1`, `purchases.auth-users.v1` |
| `inventory.products.events` | Inventory | `purchases.inventory-products.v1` |

Las réplicas del mismo consumidor lógico comparten su grupo. Inventory y Purchases nunca comparten grupo de usuarios, porque necesitan recibir ambos todos los mensajes. Los grupos se crean cuando un consumidor se suscribe: no se provisionan como tópicos.

Desarrollo: tres particiones por tópico, réplica 1, retención 7 días, `enable.auto.commit=false`, key UTF-8 `aggregateId`. Tópicos creados por `infrastructure/kafka/init-topics.sh`; autocreación deshabilitada. Los grupos nuevos usan earliest únicamente durante un bootstrap controlado. Cambiar el número de particiones exige plan de migración del orden por agregado.

## Escritura y publicación mediante outbox

1. En una transacción local, guardar la entidad, incrementar su `entityVersion` y agregar una fila outbox con el evento completo. `eventId` UUID único; `(aggregateId, entityVersion)` único. El HTTP responde tras el commit, sin esperar disponibilidad de Kafka.
2. Un publicador lee pendientes y garantiza un solo envío en curso por agregado, en orden de versión. No usar workers con `SKIP LOCKED` sin coordinar el orden por agregado. Configurar productor idempotente y `acks=all`; en local una réplica no aporta tolerancia a pérdida del broker.
3. Solo tras el acknowledgement de Kafka marcar la fila como publicada. Si cae antes de marcarla, se reenvía el mismo `eventId`. Reintentos con backoff exponencial y jitter; no perder ni saltar filas pendientes silenciosamente. Retener filas publicadas 30 días como apoyo operativo, sin considerarlas un archivo histórico ilimitado.

## Aplicación de snapshots e idempotencia

Validar JSON Schema, tipos, versión, correlación e identidad del agregado. Nunca publicar credenciales en `data`. En una transacción local: insertar `eventId` en inbox con restricción única y hacer upsert de la proyección únicamente si la nueva versión es mayor que la almacenada. Confirmar offset después del commit; duplicados y versiones antiguas no revierten datos. La inbox registra también los eventos descartados por versión.

Los eventos v1 contienen snapshots completos. Un consumidor puede crear una proyección a partir de un `Updated` cuya versión sea mayor que 1; no depende de haber recibido el `Created`. Desactivación se publica como `Updated` con `active:false`, no como borrado físico. Mantener el estado inactivo en snapshots y reconstrucciones. Los schemas v1 rechazan campos desconocidos: incluso una adición opcional requiere actualizar todos los validadores antes de que el productor la use. Si no se garantiza ese despliegue coordinado, usar nueva schemaVersion y migración de consumidores; los cambios incompatibles siempre requieren nueva versión.

## Fallos y DLQ

Reintentar fallos transitorios hasta cinco veces (1, 2, 4, 8 y 16 segundos más jitter), pausando la partición durante cada intento. Errores permanentes de schema van directamente a DLQ. Después de agotar reintentos, publicar mensaje original, tópico/partición/offset, error saneado, intentos y fecha en la DLQ del consumidor con acknowledgement antes de confirmar el offset original. Si DLQ no está disponible, no confirmar ni continuar la partición.

DLQ: `inventory.auth-users.dlq`, `purchases.auth-users.dlq`, `purchases.inventory-products.dlq`; retención 30 días. Alertar sobre cada envío. Para estos snapshots de consulta se permite avanzar después del aislamiento: un snapshot posterior puede reparar el agregado. El estado se marca degradado hasta reconciliar; esta política no sirve automáticamente para futuros eventos transaccionales de stock/pagos.

Al reparar, reproducir con el `eventId` original usando un grupo/herramienta de recuperación del mismo consumidor. Las versiones impiden sobrescribir datos más recientes. No modificar payloads para eludir deduplicación; un cambio de negocio se emite desde el propietario con nueva versión.

## Bootstrap y recuperación

Durante los primeros siete días puede reconstruirse desde earliest si se verifica que todavía existe el historial completo. Tras vencer la retención no basta con resetear offsets.

Para un bootstrap posterior, el propietario exporta un snapshot consistente con versiones y un watermark de offsets por partición, obtenido mediante un procedimiento que detiene brevemente escrituras y drena outbox antes de capturar ambos. Conservar el snapshot cifrado y con acceso limitado fuera de los contenedores. Un importador autorizado carga tablas nuevas, parte del watermark y reproduce eventos posteriores antes de intercambiar las proyecciones. La exportación/importación es administrativa; no introduce consultas HTTP entre dominios. Probar copia, recuperación e intercambio antes de considerar completo cada consumidor.

Las proyecciones solo permiten consultas locales, no conocimiento instantáneo de otros dominios. UUID inexistente o aún no replicado devuelve `409 PROJECTION_NOT_READY` y `Retry-After: 2`, sin afirmar 404 definitivo. El cliente reintenta con backoff hasta 30 segundos y luego solicita revisión; no reintenta indefinidamente. UUID mal formado: 400. Una entidad conocida inactiva produce el error de negocio específico, sin reintentar. Las operaciones idempotentes conservan su key durante esos reintentos.

## Criterios de aceptación

- Caída de Kafka después del commit: entidad/outbox persisten y el evento se entrega al volver el broker.
- Caída antes/después de confirmar offset: repetir no duplica efectos ni revierte versiones.
- Dos grupos reciben todos los usuarios; dos réplicas del mismo grupo reparten trabajo.
- Evento inválido queda observable en DLQ; si falla su publicación, no se pierde el original.
- Producto/usuario recién creado puede estar pendiente; el API distingue ese caso de inactividad.
- Reconstrucción posterior a retención desde snapshot + offsets produce el mismo estado final.

Estas son obligaciones de los futuros servicios; actualmente el repositorio contiene el Gateway y el entorno local, no productores/consumidores implementados.
