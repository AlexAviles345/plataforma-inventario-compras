from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

from purchases_service.settings import build_database_config


class FoundationTests(SimpleTestCase):
    def test_health_endpoints(self):
        live = self.client.get("/health/live")
        ready = self.client.get("/health/ready")

        self.assertEqual(live.status_code, 200)
        self.assertEqual(
            live.json(),
            {"status": "ok", "service": "purchases-service"},
        )
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(ready.json()["status"], "ready")

    def test_development_documentation(self):
        schema_response = self.client.get("/api/purchases/openapi.json")
        swagger_response = self.client.get("/docs")

        self.assertEqual(schema_response.status_code, 200)
        self.assertEqual(
            schema_response["Content-Type"],
            "application/vnd.oai.openapi+json",
        )
        schema = schema_response.json()
        self.assertEqual(schema["info"]["title"], "TechDistribution Purchases Service")
        self.assertEqual(schema["servers"], [{"url": "/"}])
        self.assertEqual(schema["paths"], {})
        self.assertIn("bearerAuth", schema["components"]["securitySchemes"])
        self.assertEqual(swagger_response.status_code, 200)

    def test_business_placeholder_routes_do_not_exist(self):
        self.assertEqual(self.client.get("/").status_code, 404)
        self.assertEqual(self.client.get("/api/purchases").status_code, 404)
        self.assertEqual(self.client.get("/api/purchases/orders").status_code, 404)

    @override_settings(DOCS_ENABLED=False)
    def test_documentation_can_be_disabled(self):
        self.assertEqual(self.client.get("/docs").status_code, 404)
        self.assertEqual(self.client.get("/api/purchases/openapi.json").status_code, 404)
        self.assertEqual(self.client.get("/health/live").status_code, 200)

    def test_postgresql_is_default_runtime_database(self):
        with patch.dict(
            "os.environ",
            {
                "DB_HOST": "localhost",
                "DB_PORT": "5433",
                "DB_NAME": "purchases_db",
                "DB_USER": "purchases_user",
                "DB_PASSWORD": "purchases_password",
                "DB_CONN_MAX_AGE": "60",
            },
            clear=True,
        ):
            config = build_database_config(debug=True, argv=["manage.py", "runserver"])

        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(config["HOST"], "localhost")
        self.assertEqual(config["PORT"], 5433)
        self.assertEqual(config["NAME"], "purchases_db")
        self.assertEqual(config["USER"], "purchases_user")
        self.assertEqual(config["CONN_MAX_AGE"], 60)

    def test_production_rejects_sqlite_or_missing_password(self):
        with (
            patch.dict("os.environ", {"DB_ENGINE": "sqlite3"}, clear=True),
            self.assertRaises(ImproperlyConfigured),
        ):
            build_database_config(debug=False, argv=["gunicorn"])

        with (
            patch.dict("os.environ", {"DB_ENGINE": "postgresql", "DB_PASSWORD": ""}, clear=True),
            self.assertRaises(ImproperlyConfigured),
        ):
            build_database_config(debug=False, argv=["gunicorn"])
