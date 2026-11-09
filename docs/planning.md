# Plan de implementación del MVP

## Alcance acordado para desarrollo

Integración de tres stacks con bases propias, autenticación centralizada, autorización local, Gateway HTTP y proyecciones Kafka. Compras registra órdenes de proveedor con líneas y datos históricos; el MVP no incluye recepción, reservas, pagos ni movimientos automáticos de stock derivados de órdenes. Inventario administra catálogo y correcciones explícitas de existencias. Una ampliación a recepción exige un nuevo contrato de eventos e idempotencia antes de implementarla.

Actualmente están implementados Gateway, entorno local y pruebas del Gateway. Auth tiene una base ejecutable con configuración, salud, OpenAPI, Docker y pruebas, pero su dominio, persistencia y eventos siguen pendientes. Inventory y Purchases están especificados, pendientes de código. No asignar porcentajes de avance ni fechas sin estimaciones del equipo. Esta secuencia ordena dependencias; cada etapa se acepta por evidencia, no solo por existir sus carpetas.

| Hito | Entregables | Depende de | Aceptación |
| --- | --- | --- | --- |
| 1. Contratos | Rutas, JWT/roles, eventos v1, reglas de órdenes/stock | Ninguno | Los documentos de servicios usan los mismos campos, puertos y políticas; schemas disponibles |
| 2. Gateway e infraestructura | Proxy seguro, límites, Swagger dev, health, Docker/CI y persistencia Kafka | 1 | Build/lint/tests pasan; HTTP conserva cuerpos; 401/403/413/429/502/504; listeners estables; mensaje sobrevive recreación Kafka en CI |
| 3. Auth | Migraciones, bootstrap ADMIN, login por sistema, usuarios/asignaciones, outbox/publicador | 1–2 | JWT válido por sistema; permisos; sin secretos en eventos; caída de Kafka no pierde cambios |
| 4. Inventory | Migraciones, productos/stock, RBAC, inbox/proyección usuarios, outbox productos | 3 | Concurrencia y stock válidos; duplicados no cambian resultado; dos consumidores de usuarios reciben todos los eventos |
| 5. Purchases | Órdenes/líneas, permisos de propiedad, snapshots, idempotencia, dos proyecciones | 3–4 | Precio histórico estable; estados/versión correctos; duplicados de POST no crean órdenes adicionales; no usa HTTP hacia dominios |
| 6. Integración y recuperación | Compose de aplicaciones, pruebas de recorrido completo, snapshots/replay/DLQ y observabilidad | 3–5 | Login→usuario→producto→proyección→orden; recuperación tras caídas, duplicados y retención; métricas/logs y runbook verificables |

Cada servicio incluye README ejecutable, archivo de configuración de ejemplo, migraciones y pruebas de permisos/datos/eventos. CI de cada stack se añade con su implementación. Los contratos no son implementaciones de outbox, consumidores ni modelos ORM.

## Casos obligatorios de integración final

1. Bootstrap de administrador, creación de usuario INVENTORY y PURCHASES, login y rechazo cruzado de tokens.
2. Crear producto con autor tomado del JWT; usuario/producto aparecen en ambas proyecciones correspondientes.
3. Crear/enviar orden con líneas y key de idempotencia; repetir simultáneamente devuelve una sola orden.
4. Cambiar catálogo después de enviar una orden no altera sus snapshots históricos.
5. Detener Kafka, confirmar una escritura y reiniciar: outbox entrega el evento; repetir no duplica efectos.
6. Detener un consumidor después del commit de proyección y antes del offset: recuperación consistente.
7. Eventos inválidos terminan en DLQ sin pérdida; proyección pendiente tiene respuesta recuperable, no un falso 404.
8. Restaurar una proyección tras vencer retención mediante snapshot consistente y watermark; comparar versiones y datos.
9. Desactivar usuario/producto: nuevas emisiones/operaciones se rechazan según proyección; documentar ventana máxima del JWT vigente.

## Operación antes de exponer el sistema

Secretos externos, TLS en ingress, aislamiento de servicios, backups restaurables, store compartido para rate limiting si hay réplicas, configuración explícita de proxies confiables y rotación de claves. Alertas por outbox pendiente, lag, DLQ y tasa 5xx. El broker local único con réplica 1 no aporta alta disponibilidad; un despliegue con tolerancia a fallos necesita capacidad y replicación revisadas.
