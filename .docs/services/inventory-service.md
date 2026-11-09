# Inventory: contrato de implementación

Estado: planificado, aún sin código. Spring Boot, MySQL, consumidor de usuarios y productor de productos. No consulta por HTTP a Auth/Compras.

`Products`: UUID, sku único, name, unit `UNIT`, stockOnHand entero >=0, active, version, createdBy/updatedBy UUID y timestamps UTC. Stock inicial/correcciones explícitas las administra INVENTORY_MANAGER o ADMIN con versión esperada y auditoría. El MVP no contabiliza automáticamente recepciones de compras. No permitir escrituras de stock basadas en el dato atrasado de una proyección ajena.

`UsersProjection`: snapshot público y versión de usuario proveniente de Auth; solo consumidores/importadores la escriben. Grupo `inventory.auth-users.v1`, tópico `auth.users.events`. Un usuario conocido inactivo se rechaza; una referencia aún ausente devuelve `409 PROJECTION_NOT_READY`, según el [protocolo común](../architecture/event-driven-communication.md).

| Endpoint | Acceso | Resultado |
| --- | --- | --- |
| `GET /api/inventory/products` | INVENTORY_MANAGER/ADMIN, token INVENTORY | Catálogo paginado; autor desde proyección local |
| `POST /api/inventory/products` | Igual | 201, SKU único, creador del JWT |
| `PUT /api/inventory/products/{id}` | Igual | expectedVersion obligatorio; 409 ante conflicto; desactivación lógica |
| `GET /api/inventory/openapi.json` | Desarrollo | Springdoc en esta ruta; paths `/api/inventory/...`, server `/` |

Verificar JWT y RBAC localmente, sin confiar exclusivamente en x-user headers. Cada cambio confirma entidad + outbox y publica `ProductCreated`/`ProductUpdated` con snapshot completo según [schema](../contracts/product-event.schema.json). No borrar físicamente productos referenciados por compras: emitir active:false.

Aceptación: migraciones, validación de SKU/stock, control concurrente, permisos de sistema, inbox/proyección atómica, eventos duplicados y desordenados, recuperación outbox, DLQ y reconstrucción desde snapshot. Configuración Spring por placeholders/perfiles; secretos locales fuera de git. README propio debe incluir migraciones y pruebas.
