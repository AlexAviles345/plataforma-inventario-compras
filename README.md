# TechDistribution - Inventory & Purchases Platform

Plataforma interna para gestionar las operaciones principales (Autenticación, Inventario y Compras) mediante una arquitectura de microservicios.

> **Nota:** Para leer sobre la arquitectura, decisiones técnicas y el diseño de la comunicación orientada a eventos, por favor revisa la carpeta [`.docs/`](./.docs).

## Requisitos Previos

- [ ] Docker y Docker Compose
- [ ] Node.js (para el servicio Auth en NestJS)
- [ ] Java / Maven (para el servicio de Inventario en Spring Boot)
- [ ] Python (para el servicio de Compras en Django)
- [ ] Base de datos PostgreSQL
- [ ] Base de datos MySQL
- [ ] Apache Kafka

## Instrucciones de Inicialización

*Agrega aquí los pasos específicos para levantar la plataforma.*

### 1. Levantar Infraestructura Base (Bases de Datos y Kafka)
Para evitar la instalación nativa de PostgreSQL, MySQL y Apache Kafka, puedes levantar toda la infraestructura base mediante Docker.
Consulta la [Guía de Configuración de Docker](./.docs/infrastructure/docker-setup.md) para ver los comandos y credenciales.

### 2. Inicializar Microservicio de Autenticación (Auth)
```bash
# Pasos para levantar el servicio NestJS
```

### 3. Inicializar Microservicio de Inventario (Inventory)
```bash
# Pasos para levantar el servicio Spring Boot
```

### 4. Inicializar Microservicio de Compras (Purchases)
```bash
# Pasos para levantar el servicio Django
```

### 5. Inicializar API Gateway
```bash
# Pasos para levantar el API Gateway
```

## Pruebas y Validación
*Agrega aquí cómo ejecutar las pruebas y validar que todos los servicios y Kafka se están comunicando correctamente.*