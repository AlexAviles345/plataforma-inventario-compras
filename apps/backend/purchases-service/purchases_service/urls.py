from django.urls import include, path
from rest_framework.routers import SimpleRouter

from health.views import LiveHealthView, ReadyHealthView
from purchases_service.views import OpenApiSchemaView, SwaggerUIView

router = SimpleRouter(trailing_slash=False)

urlpatterns = [
    path("health/live", LiveHealthView.as_view(), name="health-live"),
    path("health/ready", ReadyHealthView.as_view(), name="health-ready"),
    path(
        "api/purchases/openapi.json",
        OpenApiSchemaView.as_view(),
        name="openapi-schema",
    ),
    path("docs", SwaggerUIView.as_view(url_name="openapi-schema"), name="swagger-ui"),
    path("api/purchases/", include(router.urls)),
]
