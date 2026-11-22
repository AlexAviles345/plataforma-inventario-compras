# Inventory: contrato de implementación

Las respuestas JSON de negocio siguen el [estándar común](../../standards/api-responses.md).

Inventory valida íntegramente el [access token común](../../standards/jwt-and-sessions.md) y exige `system: "INVENTORY"`. Nunca interpreta ni acepta refresh tokens.

Estado: implementados MySQL con Flyway, validación JWT/RBAC local, los endpoints de productos y estadísticas, el historial de ajustes de stock y el productor de `ProductCreated`/`ProductUpdated` mediante outbox, con pruebas sobre MySQL y Kafka reales (ver el [README del servicio](../../../apps/backend/inventory-service/README.md)). Siguen pendientes el consumidor de usuarios hacia `UsersProjection`, su DLQ, `409 PROJECTION_NOT_READY` y las pruebas de recuperación desde snapshot. No consulta por HTTP a Auth/Compras.

`Products`: UUID, sku único, name, unit `UNIT`, stockOnHand entero >=0, active, version, createdBy/updatedBy UUID y timestamps UTC. Stock inicial/correcciones explícitas las administra INVENTORY_MANAGER o ADMIN con versión esperada, motivo saneado de 1–500 caracteres y auditoría. El MVP no contabiliza automáticamente recepciones de compras. No permitir escrituras de stock basadas en el dato atrasado de una proyección ajena.

`UsersProjection`: snapshot público y versión de usuario proveniente de Auth; solo consumidores/importadores la escriben. Grupo `inventory.auth-users.v1`, tópico `auth.users.events`. Un usuario conocido inactivo se rechaza; una referencia aún ausente devuelve `409 PROJECTION_NOT_READY`, según el [protocolo común](../../architecture/event-driven-communication.md).

Los atributos físicos previstos de productos, historial de correcciones, inbox,
outbox y la copia local de usuarios están en el
[modelo de datos planificado](../../architecture/data-model.md#inventory-mysql).

| Endpoint | Acceso | Resultado |
| --- | --- | --- |
| `GET /api/inventory/products` | INVENTORY_MANAGER/ADMIN, token INVENTORY | Catálogo paginado; autor desde proyección local |
| `GET /api/inventory/products/stats` | INVENTORY_MANAGER/ADMIN, token INVENTORY | Estadísticas agregadas del catálogo (`totalProducts`, `activeProducts`, `inactiveProducts`, `outOfStockProducts`, `totalUnitsOnHand`) |
| `POST /api/inventory/products` | Igual | 201, SKU único, creador del JWT |
| `PUT /api/inventory/products/{id}` | Igual | expectedVersion obligatorio; 409 ante conflicto; desactivación lógica |
| `GET /api/inventory/openapi.json` | Desarrollo | Springdoc en esta ruta; paths `/api/inventory/...`, server `/` |

### Contrato de respuesta para `GET /api/inventory/products/stats`

```json
{
  "error": false,
  "statusCode": 200,
  "message": "Estadísticas de inventario obtenidas exitosamente",
  "data": {
    "totalProducts": 48,
    "activeProducts": 45,
    "inactiveProducts": 3,
    "outOfStockProducts": 4,
    "totalUnitsOnHand": 1280
  }
}
```

Verificar JWT y RBAC localmente, sin confiar exclusivamente en x-user headers. Cada cambio confirma entidad + outbox y publica `ProductCreated`/`ProductUpdated` con snapshot completo según [schema](../../../contracts/events/product-event.schema.json). No borrar físicamente productos referenciados por compras: emitir active:false.

Aceptación: migraciones, validación de SKU/stock, control concurrente, permisos de sistema, inbox/proyección atómica, eventos duplicados y desordenados, recuperación outbox, DLQ y reconstrucción desde snapshot. Configuración Spring por placeholders/perfiles; secretos locales fuera de git. README propio debe incluir migraciones y pruebas.
