# Microservicio de Inventario

## Tecnología
Este microservicio será desarrollado utilizando **Spring Boot**.

## Responsabilidad Principal
Es el sistema autónomo responsable de gestionar la información del catálogo de productos y sus respectivas existencias.

## Entidades y Base de Datos
El servicio opera con su propia base de datos independiente (utilizando **MySQL**) y maneja las siguientes entidades:
- **`Products` (Principal)**: Tabla responsable de almacenar la información detallada de los productos y sus existencias.
- **`UsersProjection`**: Es una tabla de proyección local que contiene una copia simplificada de los usuarios. Esta proyección permite identificar qué usuario creó o modificó un producto sin necesidad de realizar una consulta síncrona al microservicio de Autenticación.

## Comunicación y Eventos (Kafka)
El microservicio de Inventario actúa tanto como **consumidor** como **productor** de eventos:

### Consumidor
- Escucha los eventos `UserCreated` y `UserUpdated` provenientes del servicio de Autenticación mediante Kafka para mantener actualizada su tabla local `UsersProjection`.

### Productor
- Publica eventos de dominio cuando la información de los productos cambia en su base de datos:
  - `ProductCreated`: Emitido cuando se registra un nuevo producto en el inventario.
  - `ProductUpdated`: Emitido cuando se modifica un producto existente.
Estos eventos son consumidos posteriormente por el microservicio de Compras.

## Endpoints (Mínimos Recomendados)
Para demostrar la autonomía del servicio y el uso de las proyecciones, se deben implementar mínimamente los siguientes endpoints:
- `GET /api/inventory/products`: Lista los productos disponibles. Al devolver la respuesta, utiliza la `UsersProjection` para adjuntar qué usuario registró o modificó cada producto sin consultar de forma síncrona a Auth.
- `POST /api/inventory/products`: Registra un nuevo producto (requiere token JWT válido) y publica el evento `ProductCreated` en Kafka.
- `PUT /api/inventory/products/{id}`: Actualiza un producto existente (requiere token JWT válido) y publica el evento `ProductUpdated` en Kafka.
