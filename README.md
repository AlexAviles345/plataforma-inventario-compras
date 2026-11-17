# TechDistribution — Inventario y Compras

Plataforma interna con Auth (NestJS/PostgreSQL), Inventory (Spring Boot/MySQL), Purchases (Django/PostgreSQL), Gateway NestJS, futura capa edge Nginx, CI en GitHub Actions, futura entrega con Jenkins y sincronización de proyecciones por Kafka.

**Estado actual:** Gateway, infraestructura local, contratos y planificación implementados. Purchases cuenta con su dominio, persistencia PostgreSQL, consumidores Kafka, endpoints de órdenes y pruebas completas; Auth e Inventory cuentan con bases ejecutables y validadas; el Frontend cuenta con su [contrato](docs/services/frontend-web/frontend-web.md) y [plan de implementación por fases](docs/services/frontend-web/frontend-implementation-plan.md). [Plan y criterios de aceptación](docs/planning.md), [arquitectura](docs/architecture/architecture.md), [modelo de datos](docs/architecture/data-model.md), [Nginx edge](docs/infrastructure/nginx-edge.md), [Jenkins y GitHub](docs/infrastructure/jenkins-github.md), [reglas comunes](docs/standards/guidelines.md), [respuestas HTTP](docs/standards/api-responses.md), [tokens y sesiones](docs/standards/jwt-and-sessions.md).

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

Todo el proyecto se enciende con un solo comando desde la raíz, con Docker Desktop iniciado:

```bash
npm run dev
```

`npm run dev` sigue estos pasos y se detiene en el primero que falle, explicando cómo corregirlo:

1. **Preparación** (`tools/setup.mjs`): instala solo lo que falte.
   - dependencias de la raíz, del Gateway y de Auth, y el binario de Kafka de Auth;
   - el `.venv` de Purchases y los frontends;
   - los `.env` ausentes, generados desde `.env.example` con un único `JWT_SECRET` compartido por Gateway, Auth y Purchases.

   Nunca modifica un `.env` existente.
2. **Diagnóstico** (`tools/doctor.mjs`): comprueba Node 24, npm 11, JDK 21+, Python 3.14, Docker Engine y Compose v2. Revisa también las dependencias, los `.env` y que el secreto, issuer y audience coincidan en los tres servicios. Por último revisa los puertos:
   - los de las aplicaciones deben estar libres;
   - los de PostgreSQL, MySQL y Kafka, libres o en uso por sus propios contenedores. Si otro contenedor o programa los ocupa, dice cuál.
3. **Infraestructura:** levanta PostgreSQL de Auth y de Purchases, MySQL y Kafka, y crea los tópicos.
4. **Migraciones:** aplica las de Auth y Purchases.
5. **Aplicaciones:** levanta Gateway, Auth, Inventory, Purchases y los frontends en paralelo, con logs identificados.

Comandos disponibles:

| Comando | Acción |
| --- | --- |
| `npm run dev` | Prepara, verifica, inicia bases y Kafka, aplica migraciones y levanta todas las aplicaciones |
| `npm run dev:check` | Solo diagnóstico, sin instalar ni iniciar nada (`npm run dev:check -- --no-infra` omite Docker) |
| `npm run setup` | Solo preparación: dependencias y `.env` faltantes |
| `npm run dev:apps` | Prepara y levanta aplicaciones sin iniciar Docker |
| `npm run dev:infra` | Inicia únicamente PostgreSQL, MySQL y Kafka |
| `npm run dev:status` | Muestra el estado de la infraestructura |
| `npm run dev:logs` | Sigue los últimos logs de infraestructura |
| `npm run dev:down` | Detiene contenedores sin borrar volúmenes |

`Ctrl+C` detiene conjuntamente Gateway, Auth, Inventory, Purchases y frontends. La
infraestructura iniciada en segundo plano permanece activa hasta ejecutar
`npm run dev:down`.

Las dependencias de npm exigen Node 24 (`engine-strict`). En la primera ejecución,
Auth no tiene usuarios: crea el primer administrador con el
[bootstrap](apps/backend/auth-service/README.md#primer-administrador-bootstrap).

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
`dev` o `start:dev`. `npm run dev` instala sus dependencias si faltan.
El recorrido futuro con Nginx se añadirá como `npm run dev:edge` cuando exista el
[Compose de aplicaciones](docs/infrastructure/nginx-edge.md).

Para levantar solo la infraestructura a mano:

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
