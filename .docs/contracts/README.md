# Eventos v1

JSON Schema draft 2020-12 con validación de formatos UUID/email/date-time habilitada. Cargar `event-envelope.schema.json` antes de los schemas especializados, resolviendo referencias relativas por `$id`. `data` es snapshot público completo y no admite secretos ni propiedades inesperadas.

Además del schema, productor/consumidor comprueban que `aggregateId` coincide con `data.userId`/`data.productId`, la key Kafka coincide con ese UUID y hay una sola asignación por sistema. `Created` inicia `entityVersion=1`; cada cambio incrementa una unidad y publica `Updated`. Los consumidores aceptan saltos porque los snapshots son completos, pero nunca aplican una versión menor/igual sobre otra más reciente.

| Evento | Tópico | Schema |
| --- | --- | --- |
| UserCreated, UserUpdated | auth.users.events | user-event.schema.json |
| ProductCreated, ProductUpdated | inventory.products.events | product-event.schema.json |

Ejemplo UserCreated:

```json
{
  "eventId": "f1397b74-764c-41c9-a5cd-b9fbd44ae873",
  "eventType": "UserCreated",
  "schemaVersion": 1,
  "aggregateId": "767cc714-0614-4ab9-9510-c4772b403fed",
  "entityVersion": 1,
  "timestamp": "2026-11-08T18:00:00Z",
  "correlationId": "49690ff0-e73f-434e-89b7-d5b68533eec4",
  "data": {
    "userId": "767cc714-0614-4ab9-9510-c4772b403fed",
    "email": "usuario@techdistribution.com",
    "displayName": "Usuario de inventario",
    "active": true,
    "assignments": [{"system": "INVENTORY", "role": "INVENTORY_MANAGER"}]
  }
}
```

La entrega, inbox/outbox, DLQ y reconstrucción se rigen por el [protocolo](../architecture/event-driven-communication.md). Una ampliación incompatible requiere schema nuevo, consumidores compatibles y migración; no cambiar silenciosamente la semántica de v1.
