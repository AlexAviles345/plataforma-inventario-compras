from django.test import SimpleTestCase, override_settings


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
