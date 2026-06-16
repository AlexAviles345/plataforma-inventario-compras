# Arquitectura del Sistema: TechDistribution

## Visión General
La plataforma de TechDistribution está diseñada utilizando una arquitectura basada en microservicios heterogéneos, integrados mediante un API Gateway y con comunicación asíncrona a través de Apache Kafka. El objetivo principal es garantizar la independencia de cada dominio, reducir el acoplamiento y centralizar la autenticación.

## Componentes Principales
1. **API Gateway**: Actúa como el único punto de entrada para los clientes. Su función es centralizar el acceso y enrutar las peticiones hacia los distintos microservicios.
2. **Microservicio de Autenticación (Auth)**: Desarrollado en NestJS. Centraliza la administración de usuarios, permisos, emisión de tokens JWT y expiraciones por sistema.
3. **Microservicio de Inventario (Inventory)**: Desarrollado en Spring Boot. Gestiona el catálogo de productos y sus existencias.
4. **Microservicio de Compras (Purchases)**: Desarrollado en Django Rest Framework. Administra las órdenes de compra.
5. **Apache Kafka**: Bus de mensajes para la comunicación asíncrona, encargado de distribuir eventos de dominio para mantener la sincronización de las proyecciones locales (consistencia eventual).

## Bases de Datos Independientes
Cada microservicio opera como un sistema autónomo con su propia base de datos (utilizando **PostgreSQL** o **MySQL**), garantizando que no exista dependencia directa de datos en tiempo de consulta.

Motores de base de datos asignados:
- **Auth (NestJS)**: PostgreSQL
- **Inventory (Spring Boot)**: MySQL
- **Purchases (Django)**: PostgreSQL

## Características Técnicas
Esta arquitectura demuestra los siguientes conceptos clave:
- API Gateway.
- Microservicios heterogéneos (NestJS, Spring Boot y Django).
- JWT centralizado con expiraciones por sistema.
- Comunicación asíncrona mediante Kafka.
- Consistencia eventual.
- Proyecciones locales.
- Bases de datos independientes.
