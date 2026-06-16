# Comunicación Asíncrona y Sincronización de Datos

## Apache Kafka
La integración y comunicación entre los diferentes microservicios de la plataforma TechDistribution se realiza de manera asíncrona mediante el uso de eventos de dominio distribuidos a través de **Apache Kafka**.

## Desacoplamiento y Consistencia Eventual
En lugar de que un servicio consulte a otro mediante peticiones síncronas HTTP, los servicios publican eventos cuando ocurre un cambio en sus entidades principales. Los servicios interesados (consumidores) se suscriben a estos eventos y actualizan sus propias bases de datos. 

Este enfoque garantiza:
- **Independencia Total**: Los servicios no se bloquean si otro servicio está caído.
- **Consistencia Eventual**: Los datos terminan sincronizándose en todo el sistema a través de las proyecciones.
- **Bajo Acoplamiento**: Los microservicios no necesitan conocer los detalles de implementación de los demás.

## Resumen de Eventos de Dominio

### Eventos de Autenticación (Auth)
Publicados por el microservicio Auth en NestJS:
- `UserCreated`
- `UserUpdated`
**Consumidos por**: Inventario y Compras (se utilizan para actualizar la tabla `UsersProjection` en ambos servicios).

### Eventos de Inventario
Publicados por el microservicio de Inventario en Spring Boot:
- `ProductCreated`
- `ProductUpdated`
**Consumidos por**: Compras (se utilizan para actualizar la tabla `ProductsProjection`).

## Proyecciones Locales
El uso de proyecciones locales (`UsersProjection` y `ProductsProjection`) es la estrategia fundamental para evitar la dependencia síncrona. Gracias a las proyecciones:
- El servicio de **Inventario** puede registrar qué usuario realiza las acciones utilizando su propia base de datos.
- El servicio de **Compras** puede validar tanto al usuario comprador como a los productos solicitados leyendo exclusivamente sus propias proyecciones locales, sin realizar peticiones por red.
