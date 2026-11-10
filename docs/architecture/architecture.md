# Arquitectura del Sistema: TechDistribution

## Visión General
La plataforma de TechDistribution está diseñada utilizando microservicios heterogéneos, integrados mediante un API Gateway y eventos Kafka. En el despliegue futuro, [Nginx será la capa edge](../infrastructure/nginx-edge.md) delante del frontend y del Gateway. Auth emite tokens; Gateway y cada servicio los validan independientemente y cada dominio autoriza sus operaciones. La independencia depende de entrega recuperable de eventos y de la vigencia de las proyecciones, no implica consistencia inmediata.

Estado: Gateway e infraestructura implementados; Auth, Inventory y Purchases tienen bases ejecutables, mientras sus dominios siguen planificados. [Secuencia y aceptación del MVP](../planning.md), [contrato JWT y RBAC](../standards/guidelines.md), [outbox, inbox y recuperación](event-driven-communication.md). Compras registra órdenes y conserva snapshots históricos; recepción y actualización automática de stock quedan fuera del MVP.

La entrega futura combinará GitHub Actions para checks rápidos y [Jenkins conectado con GitHub](../infrastructure/jenkins-github.md) para integración completa, publicación de imágenes y despliegues. Jenkins es infraestructura administrativa y no participa en el tráfico runtime.

## Componentes Principales
1. **Nginx (futuro)**: Punto de entrada HTTP(S), terminación TLS, frontend y proxy hacia el Gateway. No aplica reglas de negocio.
2. **Frontend(s) (futuro)**: Aplicaciones cliente servidas o enrutadas por Nginx; consumen exclusivamente el Gateway.
3. **API Gateway**: Único punto de entrada lógico de la API. Centraliza seguridad transversal y enruta hacia los microservicios; no se expone directamente cuando Nginx está habilitado.
4. **Microservicio de Autenticación (Auth)**: Desarrollado en NestJS. Centraliza la administración de usuarios, permisos, emisión de tokens JWT y expiraciones por sistema.
5. **Microservicio de Inventario (Inventory)**: Desarrollado en Spring Boot. Gestiona el catálogo de productos y sus existencias.
6. **Microservicio de Compras (Purchases)**: Desarrollado en Django Rest Framework. Administra las órdenes de compra.
7. **Apache Kafka**: Bus de mensajes para la comunicación asíncrona, encargado de distribuir eventos de dominio para mantener la sincronización de las proyecciones locales (consistencia eventual).

## Bases de Datos Independientes
Cada microservicio opera como un sistema autónomo con su propia base de datos (utilizando **PostgreSQL** o **MySQL**), garantizando que no exista dependencia directa de datos en tiempo de consulta.

Motores de base de datos asignados:
- **Auth (NestJS)**: PostgreSQL
- **Inventory (Spring Boot)**: MySQL
- **Purchases (Django)**: PostgreSQL

El [modelo de datos planificado](data-model.md) detalla tablas, atributos,
restricciones, índices y las copias locales mantenidas mediante eventos. Una
proyección pertenece a la base que la consume y nunca crea una relación SQL con la
base propietaria.

## Características Técnicas
Esta arquitectura demuestra los siguientes conceptos clave:
- API Gateway.
- Nginx como capa edge y terminación TLS.
- CI en GitHub Actions y futura entrega continua mediante Jenkins.
- Microservicios heterogéneos (NestJS, Spring Boot y Django).
- JWT centralizado con expiraciones por sistema.
- Comunicación asíncrona mediante Kafka.
- Consistencia eventual.
- Proyecciones locales.
- Bases de datos independientes.
