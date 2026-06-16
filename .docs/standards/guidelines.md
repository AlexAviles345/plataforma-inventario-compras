# Lineamientos y Reglas Arquitectónicas Estrictas

Para garantizar el correcto funcionamiento del sistema distribuido de TechDistribution y mantener la independencia de los microservicios, todos los desarrollos deben apegarse estrictamente a las siguientes reglas:

## 1. Estructura del Payload JWT
Dado que cada microservicio validará los tokens de forma independiente sin consultar al servicio de Auth en cada petición, el payload del JSON Web Token (JWT) **debe** contener la siguiente información mínima y estandarizada:

```json
{
  "sub": "UUID_del_usuario",
  "email": "usuario@techdistribution.com",
  "role": "ADMIN | INVENTORY_MANAGER | PURCHASES_AGENT",
  "system": "INVENTORY | PURCHASES",
  "iat": 1684321000,
  "exp": 1684324600
}
```
- **`sub` (Subject)**: El identificador único del usuario (obligatoriamente el mismo UUID que se distribuye por Kafka).
- **`system`**: Identificador del sistema para el cual este token fue emitido. Si un token fue emitido para `INVENTORY`, el microservicio de Compras debe rechazarlo inmediatamente.
- **`role`**: Los permisos del usuario para que el microservicio pueda aplicar su propio control de acceso (RBAC).
- **`exp`**: Tiempo de expiración, el cual variará dependiendo del sistema configurado en la tabla `Systems` de Auth.

## 2. Prohibición de Peticiones Síncronas entre Servicios
**Regla Estricta:** Ningún microservicio puede realizar peticiones HTTP (REST, GraphQL, etc.) a otro microservicio. 
- Si un servicio necesita datos de otro, debe obtenerlos de sus **proyecciones locales** alimentadas vía Kafka.
- Esto evita cuellos de botella, latencia en cascada y la dependencia de disponibilidad (Single Point of Failure).

## 3. Estructura Estándar de Eventos Kafka
Todos los eventos publicados en Kafka deben compartir una envoltura (wrapper) estándar para facilitar el consumo genérico, el trazado de errores y el ordenamiento:

```json
{
  "eventId": "UUID_del_evento",
  "eventType": "UserCreated",
  "aggregateId": "UUID_de_la_entidad",
  "timestamp": "2026-06-16T15:30:00Z",
  "data": {
    // Campos específicos del evento (ej. nombre, email, etc.)
  }
}
```
- Cada servicio que consuma eventos debe manejar la **idempotencia** utilizando el `eventId`, para evitar procesar un mismo evento más de una vez en caso de reintentos.

## 4. Propiedad y Modificación de Datos
- **Única Fuente de Verdad:** Solo el servicio propietario (quien produce los eventos de esa entidad) puede realizar operaciones de escritura (`INSERT`, `UPDATE`, `DELETE`) en sus entidades principales.
- Las **Proyecciones** (como `UsersProjection` o `ProductsProjection`) son estrictamente de **solo lectura** para el servicio que las aloja. Bajo ninguna circunstancia el servicio de Compras puede editar un producto en su `ProductsProjection`; debe esperar el evento del servicio de Inventario.

## 5. Nomenclatura y Tópicos de Kafka
- Los tópicos de Kafka deben seguir la nomenclatura: `dominio.entidad.eventos` (ejemplo: `auth.users.events`, `inventory.products.events`).
- Se debe utilizar una partición lógica, típicamente utilizando el `aggregateId` (ID del usuario o del producto) como la **Key** del mensaje en Kafka para asegurar que los eventos de la misma entidad se procesen en estricto orden cronológico.

## 6. Gestión de Configuración y Secretos
Es estrictamente necesario mantener la seguridad y claridad de las configuraciones en todos los repositorios. Para esto:
- **Para servicios basados en Node.js (Auth) y Python (Purchases)**: Todo microservicio debe contar con un archivo de ejemplo llamado `.env.example` con las variables requeridas (sin incluir contraseñas reales). Los archivos `.env` que contengan secretos reales **jamás** deben subirse al repositorio.
- **Para servicios basados en Spring Boot (Inventory)**: Las propiedades globales se mantendrán en el archivo principal `application.properties` o `application.yml`. Los secretos y configuraciones locales deben manejarse utilizando **Perfiles de Spring** (por ejemplo, creando un archivo `application-local.properties`). Este archivo de perfil con datos sensibles **no debe ser versionado** bajo ninguna circunstancia.
