# TechDistribution — Inventario y Compras

Plataforma interna con Auth (NestJS/PostgreSQL), Inventory (Spring Boot/MySQL), Purchases (Django/PostgreSQL), Gateway NestJS, futura capa edge Nginx, CI en GitHub Actions, futura entrega con Jenkins y sincronización de proyecciones por Kafka.

**Estado actual:** Gateway, infraestructura local, contratos y planificación implementados. Purchases cuenta con su dominio, persistencia PostgreSQL, consumidores Kafka, endpoints de órdenes y pruebas completas; Auth e Inventory cuentan con bases ejecutables y validadas; el Frontend cuenta con su [contrato](docs/services/frontend-web.md) y [plan de implementación por fases](docs/services/frontend-implementation-plan.md). [Plan y criterios de aceptación](docs/planning.md), [arquitectura](docs/architecture/architecture.md), [modelo de datos](docs/architecture/data-model.md), [Nginx edge](docs/infrastructure/nginx-edge.md), [Jenkins y GitHub](docs/infrastructure/jenkins-github.md), [reglas comunes](docs/standards/guidelines.md), [respuestas HTTP](docs/standards/api-responses.md), [tokens y sesiones](docs/standards/jwt-and-sessions.md).

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

## Entorno local

Requisitos actuales: Docker con Compose, Node 24.x/npm 11.x, JDK 21 o posterior compatible y Python 3.14. Inventory usa Maven Wrapper, por lo que no requiere Maven global.

La raíz incluye un supervisor multiplataforma para ejecutar todos los backends y
los futuros frontends con logs identificados. Primero instala su única dependencia:

```bash
npm install --ignore-scripts --no-audit
npm run dev:check
```

Comandos disponibles:

| Comando | Acción |
| --- | --- |
| `npm run dev` | Inicia bases/Kafka, aplica migraciones locales y levanta todas las aplicaciones |
| `npm run dev:apps` | Levanta aplicaciones sin iniciar Docker |
| `npm run dev:infra` | Inicia únicamente PostgreSQL, MySQL y Kafka |
| `npm run dev:status` | Muestra el estado de la infraestructura |
| `npm run dev:logs` | Sigue los últimos logs de infraestructura |
| `npm run dev:down` | Detiene contenedores sin borrar volúmenes |

`Ctrl+C` detiene conjuntamente Gateway, Auth, Inventory, Purchases y frontends. La
infraestructura iniciada en segundo plano permanece activa hasta ejecutar
`npm run dev:down`. `npm run dev` requiere Docker Desktop iniciado;
`npm run dev:apps` no.

Cuando los healthchecks responden, el supervisor muestra una tabla con el estado,
puerto y enlaces de cada backend. Swagger está disponible en desarrollo en:

| Servicio | Puerto | Swagger |
| --- | ---: | --- |
| API Gateway (documentación agregada) | 3000 | <http://localhost:3000/docs> |
| Auth | 3001 | <http://localhost:3001/docs> |
| Inventory | 8081 | <http://localhost:8081/docs> |
| Purchases | 8000 | <http://localhost:8000/docs> |

El supervisor detecta un frontend si existe `apps/frontend/package.json` o un
`package.json` dentro de un subdirectorio inmediato de `apps/frontend`, con script
`dev` o `start:dev`. Sus dependencias deben instalarse previamente con `npm ci`.
El recorrido futuro con Nginx se añadirá como `npm run dev:edge` cuando exista el
[Compose de aplicaciones](docs/infrastructure/nginx-edge.md).

Antes del primer arranque de cada servicio deben estar instaladas sus dependencias.
Gateway requiere además su `.env` con un `JWT_SECRET` seguro. El comando
`npm run dev:check` informa cualquier requisito faltante o puerto ocupado sin
iniciar procesos.

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

GitHub Actions valida actualmente cada backend, sus imágenes y la infraestructura, incluida publicación/consumo tras recrear Kafka. En el futuro, [Jenkins conectado con GitHub](docs/infrastructure/jenkins-github.md) realizará integración completa, publicación de imágenes y despliegues sin sustituir los checks rápidos de pull requests. La prueba completa login→usuario→producto→proyección→orden se implementará en el último hito del [plan](docs/planning.md). No se considera validada la plataforma completa por pasar únicamente las pruebas del Gateway.
