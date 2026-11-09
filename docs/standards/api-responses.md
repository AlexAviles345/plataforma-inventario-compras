# Estándar de respuestas HTTP

Este contrato es neutral al framework y aplica a todas las respuestas JSON de
negocio bajo `/api/**` producidas por Auth, Inventory, Purchases y el Gateway.
NestJS, Spring Boot y Django deben implementar la misma representación sin
compartir código entre lenguajes.

El Gateway no vuelve a envolver respuestas de los servicios: conserva status,
headers y cuerpo. Solo genera este contrato cuando el propio Gateway rechaza o
no puede completar una solicitud.

## Reglas generales

- El status HTTP es la fuente de verdad. `statusCode` debe tener exactamente el
  mismo valor.
- Las propiedades usan `camelCase`; UUID, fechas y decimales se representan de
  acuerdo con las [reglas comunes](guidelines.md).
- `message` es texto para personas y puede cambiar o traducirse. Los clientes
  no toman decisiones comparando ese texto.
- Los clientes deciden por status HTTP y, en errores, por `code`.
- `data` siempre existe en respuestas exitosas. Usar `{}`, `[]` o `null` según
  el contrato; nunca omitirlo ni devolver `undefined`.
- `meta` solo aparece cuando existe metadata real. En el MVP se reserva para
  paginación.
- `X-Request-Id` es el identificador canónico de trazabilidad y debe estar en el
  header de la respuesta. No es necesario duplicarlo en el body.
- Toda respuesta JSON usa `Content-Type: application/json` y codificación UTF-8.
  El parámetro `charset=utf-8` puede aparecer u omitirse según el framework.
- No se exponen stack traces, consultas SQL, nombres de tablas, secretos ni
  excepciones internas.

## Respuesta exitosa

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `error` | boolean | Sí | Siempre `false` |
| `statusCode` | integer | Sí | Igual al status HTTP, normalmente 200 o 201 |
| `message` | string | Sí | Descripción breve de la operación completada |
| `data` | cualquier JSON documentado | Sí | Recurso, colección o `null` |
| `meta` | object | No | Solo metadata definida por este contrato |

Consulta de un recurso:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
X-Request-Id: 4a037dac-a9f1-4f91-94d7-b926fb395be6
```

```json
{
  "error": false,
  "statusCode": 200,
  "message": "Producto obtenido exitosamente",
  "data": {
    "id": "5015c8cb-3687-4482-a19b-e95f50f12d6a",
    "sku": "LAP-001",
    "name": "Laptop"
  }
}
```

Creación:

```http
HTTP/1.1 201 Created
```

```json
{
  "error": false,
  "statusCode": 201,
  "message": "Recurso creado exitosamente",
  "data": {
    "id": "5015c8cb-3687-4482-a19b-e95f50f12d6a"
  }
}
```

Eliminación o comando sin representación adicional:

```json
{
  "error": false,
  "statusCode": 200,
  "message": "Recurso eliminado exitosamente",
  "data": null
}
```

El proyecto usa `200` cuando necesita devolver esta envoltura. Una respuesta
`204 No Content` no puede incluir body y solo se usa si el contrato del endpoint
lo declara expresamente; nunca se envía la envoltura con status 204.

## Paginación

Las colecciones paginadas colocan el array en `data` y la información de página
en `meta`:

```json
{
  "error": false,
  "statusCode": 200,
  "message": "Productos obtenidos exitosamente",
  "data": [
    {
      "id": "5015c8cb-3687-4482-a19b-e95f50f12d6a",
      "sku": "LAP-001",
      "name": "Laptop"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 37,
    "totalPages": 2
  }
}
```

Reglas:

- `page` comienza en 1.
- `limit` es mayor que cero y no supera el máximo documentado por el endpoint.
- `total` es el total de elementos antes de paginar.
- `totalPages` es `ceil(total / limit)`; vale 0 cuando `total` es 0.
- Una página válida sin resultados devuelve `data: []`, no 404.
- Parámetros de paginación inválidos devuelven 400 `VALIDATION_ERROR`.

## Respuesta de error

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `error` | boolean | Sí | Siempre `true` |
| `statusCode` | integer | Sí | Igual al status HTTP |
| `code` | string | Sí | Código estable en `UPPER_SNAKE_CASE` |
| `message` | string | Sí | Mensaje seguro para personas |
| `source` | string | Sí | `gateway`, `auth`, `inventory` o `purchases` |
| `timestamp` | string | Sí | Fecha UTC ISO 8601 |
| `details` | array | No | Errores de campos o contexto seguro y accionable |

Cada elemento de `details` tiene `code` y `message`; `field` solo se incluye si
el error corresponde a un campo de entrada. Los nombres usan la ruta JSON que
ve el cliente, por ejemplo `lines[0].unitPrice`.

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "error": true,
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "La solicitud contiene datos inválidos",
  "source": "purchases",
  "timestamp": "2026-11-09T18:30:00.000Z",
  "details": [
    {
      "field": "lines[0].unitPrice",
      "code": "INVALID_DECIMAL_SCALE",
      "message": "Debe contener como máximo dos decimales"
    }
  ]
}
```

Conflicto de negocio:

```json
{
  "error": true,
  "statusCode": 409,
  "code": "VERSION_CONFLICT",
  "message": "El recurso fue modificado por otra operación",
  "source": "inventory",
  "timestamp": "2026-11-09T18:30:00.000Z"
}
```

## Catálogo base de errores

| HTTP | `code` base | Uso |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body, query o parámetros inválidos |
| 401 | `AUTHENTICATION_REQUIRED` | Token ausente |
| 401 | `INVALID_TOKEN` | Token inválido o expirado |
| 403 | `FORBIDDEN` | Identidad válida sin permiso |
| 404 | `RESOURCE_NOT_FOUND` | Recurso del dominio inexistente |
| 409 | `VERSION_CONFLICT` | Fallo de control optimista |
| 409 | `IDEMPOTENCY_CONFLICT` | Misma key con otra solicitud |
| 409 | `PROJECTION_NOT_READY` | Proyección aún no disponible |
| 413 | `PAYLOAD_TOO_LARGE` | Body excede el límite |
| 429 | `RATE_LIMITED` | Límite temporal excedido |
| 500 | `INTERNAL_ERROR` | Error no esperado y saneado |
| 502 | `UPSTREAM_UNAVAILABLE` | Gateway no contacta al servicio |
| 504 | `UPSTREAM_TIMEOUT` | Servicio excede el plazo del Gateway |

Cada dominio puede agregar códigos más específicos, pero no reutilizar un mismo
código con significados distintos. `PROJECTION_NOT_READY` y `RATE_LIMITED`
incluyen además el header `Retry-After` cuando el servidor conoce el plazo.

## Excepciones al formato

No se aplica la envoltura a:

- `/health/live`, `/health/ready` y endpoints operativos de Actuator.
- documentos OpenAPI y la interfaz Swagger.
- respuestas HTML, archivos, streams y descargas binarias.
- `204 No Content` cuando el endpoint lo documente expresamente.

Los errores JSON producidos antes de llegar a una de esas representaciones sí
usan el contrato de error cuando sea técnicamente posible.

## Responsabilidad por componente

- Cada servicio envuelve una sola vez sus éxitos y normaliza sus excepciones.
- El Gateway reenvía sin envolver las respuestas de dominio.
- Los errores originados en el Gateway usan `source: "gateway"` y el mismo
  contrato.
- Ningún servicio responde `200` para representar un error de negocio.
- OpenAPI documenta la envoltura completa y ejemplos de cada status relevante,
  no únicamente el tipo contenido dentro de `data`.

## Implementación por stack

- NestJS: DTO genérico para éxitos, interceptor global y exception filter.
- Spring Boot: tipos genéricos/records, `ResponseEntity` y
  `@RestControllerAdvice`.
- Django REST Framework: helper o serializer de respuesta y exception handler
  global.

La implementación concreta permanece dentro de cada servicio. No se publica un
paquete compartido entre lenguajes; la compatibilidad se comprueba mediante
OpenAPI y pruebas de contrato.

## Pruebas de aceptación

Cada endpoint de negocio debe demostrar que:

1. el status HTTP coincide con `statusCode`;
2. `error` coincide con la familia de la respuesta;
3. los éxitos siempre contienen `data`;
4. los errores contienen un `code` documentado y no filtran información interna;
5. la paginación cumple las fórmulas y límites definidos;
6. OpenAPI describe exactamente el body observable;
7. la misma respuesta atraviesa el Gateway sin una segunda envoltura.

## Ajustes al DTO de referencia

El DTO propuesto es una buena base para NestJS. Al implementarlo se debe cambiar
`any` por genéricos o tipos concretos, declarar `error` como literal `false`,
tipar `meta` como `PaginationMeta` y hacer que el helper paginado construya la
respuesta completa junto con `data`, no solamente el objeto `meta`. Los errores
se implementan en un DTO separado porque requieren `code`, `source`, `timestamp`
y `details`.
