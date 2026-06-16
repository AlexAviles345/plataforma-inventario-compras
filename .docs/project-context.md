# TechDistribution: Contexto del Proyecto

## Objetivo Principal
Diseñar e implementar una arquitectura basada en microservicios utilizando múltiples tecnologías (**NestJS, Spring Boot y Django Rest Framework**), integradas mediante un **API Gateway** y comunicación asíncrona con **Apache Kafka**.

> [!NOTE]
> El propósito es permitir la gestión independiente de autenticación, inventario y compras, así como la sincronización de información mediante **eventos de dominio y proyecciones locales** para reducir drásticamente el acoplamiento entre servicios.

## Contexto de Negocio
La empresa **TechDistribution** requiere una plataforma interna para gestionar sus operaciones principales. El sistema estará dividido en tres dominios independientes:

1. **Autenticación (Auth)**
2. **Inventario**
3. **Compras**

Aunque cada dominio funcionará como un sistema autónomo con su propia base de datos y lógica de negocio, todos compartirán un servicio centralizado de autenticación encargado de la administración de usuarios, permisos y emisión de tokens JWT. Adicionalmente, un API Gateway actuará como punto único de entrada para los clientes, centralizando el acceso y el enrutamiento.

---

## Estructura de Dominios y Entidades

| Microservicio | Tecnología | Base de Datos | Entidades Principales | Proyecciones Locales (Solo Lectura) |
|---------------|------------|---------------|-----------------------|-------------------------------------|
| **Auth**      | NestJS     | PostgreSQL    | `Users`, `Systems`    | *(Ninguna)* |
| **Inventory** | Spring Boot| MySQL         | `Products`            | `UsersProjection` |
| **Purchases** | Django REST| PostgreSQL    | `PurchaseOrders`      | `UsersProjection`, `ProductsProjection` |

---

## Flujo de Eventos (Apache Kafka)

La comunicación entre los microservicios se realizará de forma asíncrona mediante Apache Kafka, utilizando el patrón de **Consistencia Eventual**.

### Eventos Producidos por `Auth`
- `UserCreated`
- `UserUpdated`

*→ Estos eventos son consumidos por Inventario y Compras para mantener sincronizadas sus proyecciones de usuarios.*

### Eventos Producidos por `Inventory`
- `ProductCreated`
- `ProductUpdated`

*→ Estos eventos son consumidos por Compras para actualizar su proyección de productos.*

---

## Características Arquitectónicas Demostradas
Con esta arquitectura, el proyecto es capaz de demostrar el dominio de los siguientes conceptos avanzados:

- **API Gateway** como punto único de entrada.
- **Microservicios heterogéneos** con distintos stacks tecnológicos.
- **Autorización JWT centralizada** con expiraciones dinámicas por sistema.
- **Comunicación asíncrona (Message Broker)** mediante Kafka.
- **Consistencia Eventual** en sistemas distribuidos.
- Uso de **Proyecciones Locales** para evitar bloqueos y acoplamiento.
- **Bases de Datos Independientes** por cada servicio.