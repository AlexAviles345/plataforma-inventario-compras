# Auth Service

Base ejecutable del servicio de autenticación de TechDistribution. Usa NestJS 11, Node 24 y npm 11. La implementación de usuarios, sistemas, login, JWT, PostgreSQL y publicación Kafka se agregará por módulos sobre esta base.

## Requisitos

- Node.js 24.9 o posterior dentro de la rama 24.x.
- npm 11.x.
- Acceso al mirror npm configurado en `.npmrc`.

## Inicialización

```bat
cd apps\backend\auth-service
set npm_config_offline=
set HTTP_PROXY=
set HTTPS_PROXY=
npm ci
copy .env.example .env
```

Las variables actuales son `PORT` (3001), `NODE_ENV` y `DOCS_ENABLED`. La aplicación aplica valores seguros de desarrollo si no existe `.env`; el archivo será necesario cuando se incorporen secretos y conexiones.

## Ejecución

```bat
npm run start:dev
```

Endpoints disponibles:

- `GET http://localhost:3001/health/live`
- `GET http://localhost:3001/health/ready`
- `GET http://localhost:3001/api/auth/openapi.json` en desarrollo
- `GET http://localhost:3001/docs` en desarrollo

Las rutas de negocio futuras quedan bajo `/api/auth`. Swagger se rechaza en producción cuando `NODE_ENV=production`.

## Validación

```bat
npm run format:check
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

## Siguientes módulos

El contrato de implementación está en [`docs/services/auth-service.md`](../../../docs/services/auth-service.md). Las siguientes etapas incorporarán, sin mezclarlas con el bootstrap:

1. Persistencia PostgreSQL y migraciones.
2. Usuarios, sistemas y asignaciones.
3. Bootstrap administrativo.
4. Login, JWT y autorización.
5. Outbox y publicación de eventos Kafka.
6. Observabilidad y pruebas de integración.

Cada dependencia de dominio se agregará con el módulo que realmente la utilice para evitar paquetes muertos y conexiones prematuras.
