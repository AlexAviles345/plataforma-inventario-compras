# TechDistribution — Inventario y Compras

Plataforma interna con Auth (NestJS/PostgreSQL), Inventory (Spring Boot/MySQL), Purchases (Django/PostgreSQL), Gateway NestJS y sincronización de proyecciones por Kafka.

**Estado actual:** Gateway, infraestructura local, contratos y planificación implementados. Auth, Inventory y Purchases cuentan con bases ejecutables y validadas; sus módulos de dominio siguen pendientes. [Plan y criterios de aceptación](docs/planning.md), [arquitectura](docs/architecture/architecture.md), [reglas comunes](docs/standards/guidelines.md), [respuestas HTTP](docs/standards/api-responses.md).

## Estructura del repositorio

```text
apps/
  backend/       Gateway y microservicios desplegables
  frontend/      Aplicaciones web o cliente desplegables
contracts/       Contratos neutrales compartidos entre tecnologías
docs/            Arquitectura, estándares, planificación y documentación de servicios
infrastructure/  Recursos de infraestructura y aprovisionamiento local
```

Cada servicio o frontend nuevo vive dentro de `apps/` con su configuración, dependencias, pruebas y README propios. Los contratos compartidos no dependen de un lenguaje o framework concreto.

## Entorno localMemoriaConsumoRepository

Requisitos actuales: Docker con Compose, Node 24.x/npm 11.x, JDK 21 o posterior compatible y Python 3.14. Inventory usa Maven Wrapper, por lo que no requiere Maven global.

```bash
docker compose -f docker-compose.example.yml up -d --wait postgres-auth postgres-purchases mysql-inventory kafka
docker compose -f docker-compose.example.yml run --rm kafka-init
```

El ejemplo versionado es un entorno local reproducible con credenciales de demostración y puertos publicados solo en loopback. No contiene secretos de producción. [Puertos, pruebas Kafka y persistencia](docs/infrastructure/docker-setup.md).

Después sigue el [README del Gateway](apps/backend/api-gateway/README.md) para instalar, generar el secreto, configurar `.env` y arrancar. Health del Gateway no comprueba que Auth/Inventory/Purchases estén implementados ni disponibles; hasta levantarlos, sus rutas devolverán 502.

## Desarrollo y validación

```bash
cd apps/backend/api-gateway
npm ci --ignore-scripts
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm audit
```

CI valida Gateway, imagen Docker e infraestructura, incluida publicación/consumo tras recrear Kafka. La prueba completa login→usuario→producto→proyección→orden se implementará en el último hito del [plan](docs/planning.md). No se considera validada la plataforma completa por pasar únicamente las pruebas del Gateway.
