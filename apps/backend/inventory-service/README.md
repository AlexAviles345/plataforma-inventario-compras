# Inventory Service

Base ejecutable del servicio de inventario de TechDistribution. Usa Spring Boot 4.1.2, Java 21 como objetivo de compilación y Maven Wrapper. Los módulos de productos, stock, MySQL y Kafka se agregarán después sobre esta base.

## Requisitos

- JDK 21 o posterior compatible. El proyecto compila con `--release 21`.
- Acceso a Maven Central para la primera descarga del Wrapper y dependencias.
- No se requiere Maven global.

## Inicialización y validación

En Windows:

```bat
cd apps\backend\inventory-service
mvnw.cmd -B -ntp verify
```

En Linux o macOS:

```bash
cd apps/backend/inventory-service
./mvnw -B -ntp verify
```

## Ejecución

```bat
mvnw.cmd spring-boot:run
```

Variables actuales:

- `PORT`: puerto HTTP, 8081 por defecto.
- `DOCS_ENABLED`: habilita OpenAPI y Swagger; debe ser `false` en producción.

Endpoints disponibles:

- `GET http://localhost:8081/health/live`
- `GET http://localhost:8081/health/ready`
- `GET http://localhost:8081/actuator/health`
- `GET http://localhost:8081/api/inventory/openapi.json` en desarrollo
- `GET http://localhost:8081/docs` en desarrollo

Las rutas de negocio futuras usarán `/api/inventory`. No existen endpoints placeholder de productos.

## Siguientes módulos

El contrato de implementación está en [`docs/services/inventory-service.md`](../../../docs/services/inventory-service.md). Las siguientes etapas incorporarán:

1. Persistencia MySQL y migraciones Flyway.
2. Productos, existencias y control optimista de versiones.
3. Validación JWT y RBAC local.
4. Inbox y proyección local de usuarios.
5. Outbox y eventos de productos mediante Kafka.
6. Reconstrucción, DLQ, observabilidad y pruebas de integración.

Las dependencias de JPA, MySQL, seguridad y Kafka se agregarán junto con esos módulos para que esta base pueda arrancar sin infraestructura externa.
