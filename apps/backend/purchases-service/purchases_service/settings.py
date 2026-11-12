import os
import socket
import sys
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    value = raw_value.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ImproperlyConfigured(f"{name} debe ser true o false")


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_int(
    name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        value = default
    else:
        try:
            value = int(raw_value.strip())
        except ValueError as exc:
            raise ImproperlyConfigured(f"{name} debe ser un número entero válido") from exc

    if minimum is not None and value < minimum:
        raise ImproperlyConfigured(f"{name} debe ser mayor o igual a {minimum}")
    if maximum is not None and value > maximum:
        raise ImproperlyConfigured(f"{name} debe ser menor o igual a {maximum}")
    return value


def _postgres_is_reachable(host: str, port: int, timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def build_database_config(*, debug: bool, argv: list[str] | None = None) -> dict[str, object]:
    args = argv if argv is not None else sys.argv
    command = args[1] if len(args) > 1 else ""
    is_testing = command == "test"
    allows_sqlite_fallback = command in {"test", "makemigrations", "check"}

    raw_engine = os.getenv("DB_ENGINE")
    engine_choice = (raw_engine or "postgresql").strip().lower()
    if engine_choice not in {"postgresql", "sqlite3"}:
        raise ImproperlyConfigured("DB_ENGINE debe ser 'postgresql' o 'sqlite3'")

    if engine_choice == "sqlite3" and not debug and not allows_sqlite_fallback:
        raise ImproperlyConfigured(
            "DB_ENGINE=sqlite3 no está permitido fuera de desarrollo/pruebas"
        )

    host = os.getenv("DB_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = env_int("DB_PORT", 5433, minimum=1, maximum=65535)
    name = os.getenv("DB_NAME", "purchases_db").strip()
    user = os.getenv("DB_USER", "purchases_user").strip()
    default_password = "purchases_password" if (debug or allows_sqlite_fallback) else ""
    password = os.getenv("DB_PASSWORD", default_password)
    conn_max_age = env_int("DB_CONN_MAX_AGE", 60, minimum=0)

    if (
        allows_sqlite_fallback
        and raw_engine is None
        and engine_choice == "postgresql"
        and not _postgres_is_reachable(host, port)
    ):
        engine_choice = "sqlite3"

    if engine_choice == "sqlite3":
        return {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:" if is_testing else BASE_DIR / "db.sqlite3",
            "OPTIONS": {"timeout": 20},
        }

    if not name or not user or not password:
        raise ImproperlyConfigured(
            "DB_NAME, DB_USER y DB_PASSWORD deben estar configurados para PostgreSQL"
        )

    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": name,
        "USER": user,
        "PASSWORD": password,
        "HOST": host,
        "PORT": port,
        "CONN_MAX_AGE": conn_max_age,
        "OPTIONS": {"connect_timeout": 5},
    }


DEBUG = env_bool("DJANGO_DEBUG", True)
DOCS_ENABLED = env_bool("DOCS_ENABLED", DEBUG)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY and DEBUG:
    SECRET_KEY = "development-only-secret-key-change-before-production-0000000000"
if len(SECRET_KEY.encode("utf-8")) < 32:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY debe contener al menos 32 bytes fuera del desarrollo local"
    )

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,[::1],testserver",
)

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "health",
    "orders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "purchases_service.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

WSGI_APPLICATION = "purchases_service.wsgi.application"
ASGI_APPLICATION = "purchases_service.asgi.application"

DATABASES = {
    "default": build_database_config(debug=DEBUG),
}

LANGUAGE_CODE = "es-mx"
TIME_ZONE = "America/Mexico_City"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "UNAUTHENTICATED_USER": None,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "TechDistribution Purchases Service",
    "DESCRIPTION": "Órdenes de compra a proveedores",
    "VERSION": "1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVERS": [{"url": "/"}],
    "SECURITY": [{"bearerAuth": []}],
    "APPEND_COMPONENTS": {
        "securitySchemes": {
            "bearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
            }
        }
    },
}
