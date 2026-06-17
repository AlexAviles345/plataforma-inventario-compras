# Microservicio de Compras

## Tecnología
Este microservicio será desarrollado utilizando **Django Rest Framework**.

## Responsabilidad Principal
Es el sistema autónomo encargado de registrar y gestionar las órdenes de compra realizadas a los proveedores.

## Entidades y Base de Datos
El servicio maneja su propia base de datos (utilizando **PostgreSQL**), garantizando su autonomía con las siguientes tablas:
- **`PurchaseOrders` (Principal)**: Tabla central encargada de registrar y almacenar las órdenes de compra.
- **`UsersProjection`**: Tabla que dispone localmente de la información básica de los usuarios de la plataforma, utilizada para validar usuarios vinculados a las compras sin depender de consultas en tiempo real al servicio de Auth.
- **`ProductsProjection`**: Tabla que almacena una copia simplificada de los productos registrados en el Inventario. Permite validar los productos que se agregan a las órdenes de compra sin consultar de forma síncrona al servicio de Inventario.

## Comunicación y Eventos (Kafka)
El microservicio de Compras actúa exclusivamente como **consumidor** de eventos en la arquitectura descrita:
- Escucha los eventos `UserCreated` y `UserUpdated` del microservicio de Autenticación para actualizar automáticamente su tabla `UsersProjection`.
- Escucha los eventos `ProductCreated` y `ProductUpdated` del microservicio de Inventario para mantener sincronizada su tabla `ProductsProjection`.

## Endpoints (Mínimos Recomendados)
Para evidenciar el total desacoplamiento, el servicio debe exponer los siguientes endpoints que no realizarán llamadas HTTP a ningún otro servicio:
- `GET /api/purchases/orders`: Lista el historial de órdenes de compra, enriqueciendo la respuesta con los datos locales del comprador (desde `UsersProjection`) y de los productos (desde `ProductsProjection`).
- `POST /api/purchases/orders`: Registra una nueva orden de compra. Validará internamente que el token JWT tenga permisos, que el usuario exista en `UsersProjection` y que los productos a comprar existan usando únicamente `ProductsProjection`.
