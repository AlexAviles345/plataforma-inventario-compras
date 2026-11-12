# Purchases Service

Base ejecutable del servicio de compras de TechDistribution. Usa Django 6.0.10,
Django REST Framework 3.17.2 y Python 3.14. Los módulos de órdenes, PostgreSQL y
Kafka se agregarán después sobre esta base.

## Requisitos

- Python 3.14.
- Acceso a PyPI para instalar las dependencias la primera vez.
- No se requiere PostgreSQL ni Kafka en esta etapa.

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
python manage.py test
```

En CMD, la activación es `.venv\Scripts\activate.bat`. En Linux o macOS es
`source .venv/bin/activate`.

## Ejecución

```powershell
python manage.py runserver 0.0.0.0:8000
```

La configuración se recibe desde el entorno; `.env.example` documenta las
variables, pero Django no carga archivos `.env` automáticamente.

- `DJANGO_DEBUG`: modo de desarrollo; `true` por defecto en ejecución local.
- `DOCS_ENABLED`: habilita OpenAPI y Swagger; debe ser `false` en producción.
- `DJANGO_SECRET_KEY`: mínimo 32 bytes; obligatoria cuando debug está deshabilitado.
- `DJANGO_ALLOWED_HOSTS`: hosts separados por comas.
- `PORT`: puerto de Gunicorn, 8000 por defecto.
- `WEB_CONCURRENCY`: procesos de Gunicorn, 2 por defecto.

Endpoints disponibles:

- `GET http://localhost:8000/health/live`
- `GET http://localhost:8000/health/ready`
- `GET http://localhost:8000/api/purchases/openapi.json` en desarrollo
- `GET http://localhost:8000/docs` en desarrollo

Las rutas de negocio futuras usarán `/api/purchases` y los routers DRF están
configurados sin barra final. No existen endpoints placeholder de órdenes.

## Siguientes módulos

El contrato está en
[`docs/services/purchases-service.md`](../../../docs/services/purchases-service.md)
y el desglose detallado de implementación por fases está en
[`PHASES_README.md`](./PHASES_README.md).
Las siguientes etapas incorporarán:

1. PostgreSQL y migraciones de dominio.
2. Órdenes, líneas, dinero exacto y snapshots históricos.
3. Validación JWT, propiedad y RBAC local.
4. Idempotencia y control optimista de versiones.
5. Inbox y proyecciones de usuarios y productos mediante Kafka.
6. Recuperación, DLQ, observabilidad y pruebas de integración.

SQLite se usa únicamente para que esta base pueda arrancar sin infraestructura
externa. Se reemplazará por PostgreSQL al implementar la persistencia del dominio.
