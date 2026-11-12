# Purchases Service

Servicio de compras de TechDistribution sobre Django 6.0.10, Django REST Framework
3.17.2, PostgreSQL (`psycopg` 3.3.8) y Python 3.14. Cuenta con la configuración de
base de datos, el modelo de datos completo (`purchase_orders`, `purchase_order_lines`,
`idempotency_keys`, `purchase_order_history`, `user_projections`,
`product_projections`, `inbox_events`) y sus migraciones iniciales.

## Requisitos

- Python 3.14.
- Acceso a PyPI para instalar las dependencias la primera vez.
- PostgreSQL 15 (`postgres-purchases` en puerto local `5433`) para ejecución y migraciones en desarrollo.

## Instalación y validación

En Windows PowerShell:

```powershell
cd apps\backend\purchases-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --requirement requirements-dev.txt
python -m ruff check .
python -m ruff format --check .
python manage.py check
python manage.py makemigrations --check --dry-run
python -Wa manage.py test
```

En CMD, la activación es `.venv\Scripts\activate.bat`. En Linux o macOS es
`source .venv/bin/activate`.

## Migraciones y Ejecución

Con el contenedor `postgres-purchases` activo (`npm run dev:infra` desde la raíz):

```powershell
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

La configuración se recibe desde variables de entorno o desde un archivo local
`.env` (cargado automáticamente por `settings.py` sin sobrescribir variables ya
presentes en el sistema); `.env.example` documenta las variables disponibles.

- `DJANGO_DEBUG`: modo de desarrollo; `true` por defecto en ejecución local.
- `DOCS_ENABLED`: habilita OpenAPI y Swagger; debe ser `false` en producción.
- `DJANGO_SECRET_KEY`: mínimo 32 bytes; obligatoria cuando debug está deshabilitado.
- `DJANGO_ALLOWED_HOSTS`: hosts separados por comas.
- `PORT`: puerto de Gunicorn, 8000 por defecto.
- `WEB_CONCURRENCY`: procesos de Gunicorn, 2 por defecto.
- `DB_ENGINE`: `postgresql` por defecto (`sqlite3` solo permitido en desarrollo/pruebas locales sin Docker).
- `DB_HOST`: `127.0.0.1` por defecto.
- `DB_PORT`: `5433` por defecto.
- `DB_NAME`: `purchases_db` por defecto.
- `DB_USER`: `purchases_user` por defecto.
- `DB_PASSWORD`: contraseña de PostgreSQL (`purchases_password` en desarrollo local; obligatoria en producción).
- `DB_CONN_MAX_AGE`: segundos de persistencia de conexión (`60` por defecto).
- `JWT_SECRET`: secreto HS256 compartido con Auth y Gateway (mínimo 32 bytes).
- `JWT_ISSUER`: emisor esperado (`techdistribution-auth` por defecto).
- `JWT_AUDIENCE`: audiencia esperada (`techdistribution-api` por defecto).
- `JWT_MAX_TTL_SECONDS`: vigencia máxima permitida del access token (`900` por defecto, hasta `3600`).
- `KAFKA_BOOTSTRAP_SERVERS`: brokers de Apache Kafka (`localhost:9092` por defecto).

## Consumidores Kafka y Bootstrap de Proyecciones

Para ejecutar los consumidores de proyecciones con commit manual de offsets y DLQ:

```powershell
python manage.py consume_projections --domain user
python manage.py consume_projections --domain product
```

Para importar un snapshot JSON consistente con watermarks por partición:

```powershell
python manage.py import_projection_snapshot --domain user --file snapshot-users.json
python manage.py import_projection_snapshot --domain product --file snapshot-products.json
```

Para generar un token JWT `HS256` de prueba en desarrollo local (`DJANGO_DEBUG=true`) y poblar automáticamente el usuario y 3 productos de muestra en las proyecciones locales (sin necesitar que `auth-service` o `inventory-service` estén encendidos):

```powershell
python manage.py generate_dev_token --role ADMIN
python manage.py generate_dev_token --role PURCHASES_AGENT
```

Endpoints disponibles:

- `GET http://localhost:8000/health/live`
- `GET http://localhost:8000/health/ready`
- `GET http://localhost:8000/api/purchases/openapi.json` en desarrollo
- `GET http://localhost:8000/docs` en desarrollo
- `GET http://localhost:8000/api/purchases/orders` (listado paginado de órdenes)
- `POST http://localhost:8000/api/purchases/orders` (crear orden `DRAFT` con `Idempotency-Key`)
- `GET http://localhost:8000/api/purchases/orders/{id}` (detalle de orden y líneas)
- `PUT http://localhost:8000/api/purchases/orders/{id}` (editar orden `DRAFT` con `expectedVersion`)
- `POST http://localhost:8000/api/purchases/orders/{id}/submit` (enviar y congelar orden `DRAFT` con `Idempotency-Key` y `expectedVersion`)
- `POST http://localhost:8000/api/purchases/orders/{id}/cancel` (cancelar orden `DRAFT` o `SUBMITTED` con `Idempotency-Key` y `expectedVersion`)
- `GET http://localhost:8000/api/purchases/orders/{id}/history` (historial auditable de versiones)

Los routers DRF están configurados sin barra final (`trailing_slash=False`).

## Siguientes módulos

El contrato está en
[`docs/services/purchases-service.md`](../../../docs/services/purchases-service.md)
y el desglose detallado de arquitectura e implementación por fases está en
[`docs/services/purchases-implementation-plan.md`](../../../docs/services/purchases-implementation-plan.md).
Las etapas del plan son:

1. PostgreSQL y migraciones de dominio (implementado en Fase 1).
2. Estándar HTTP, trazabilidad, validación JWT y RBAC local en `core/` (implementado en Fase 2).
3. Inbox y proyecciones de usuarios y productos mediante Kafka (implementado en Fase 3).
4. Órdenes, líneas, dinero exacto, snapshots históricos, idempotencia y control optimista (implementado en Fase 4).
5. Pruebas de aceptación integrales y cierre del servicio (implementado en Fase 5).
