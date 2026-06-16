# Microservicio de Autenticación (Auth)

## Tecnología
Este microservicio será desarrollado utilizando **NestJS**.

## Responsabilidad Principal
Es el sistema autónomo encargado de la administración centralizada de usuarios, permisos y la emisión de tokens JWT para toda la plataforma.

## Entidades y Base de Datos
El servicio cuenta con su propia base de datos independiente (utilizando **PostgreSQL**) con las siguientes tablas:
- **`Users` (Principal)**: Almacena la información central de todos los usuarios del sistema.
- **`Systems`**: Define los sistemas disponibles en la plataforma (Inventario y Compras) junto con sus políticas de autenticación, lo que incluye los tiempos de expiración de los tokens JWT específicos para cada sistema.

## Comunicación y Eventos (Kafka)
El servicio de Autenticación actúa como **productor** de eventos para mantener sincronizadas las proyecciones en los demás servicios. Cada vez que ocurre un cambio en la entidad principal de usuarios, el servicio emite los siguientes eventos a Apache Kafka:
- `UserCreated`: Publicado cuando se crea un nuevo usuario.
- `UserUpdated`: Publicado cuando se actualiza la información de un usuario existente.

Estos eventos permiten que los microservicios de Inventario y Compras mantengan sus propias copias locales (proyecciones) de los usuarios para no depender de consultas síncronas.
