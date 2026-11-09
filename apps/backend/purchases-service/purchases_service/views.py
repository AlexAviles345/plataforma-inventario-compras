from django.conf import settings
from django.http import Http404
from drf_spectacular.renderers import OpenApiJsonRenderer
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


class DevelopmentDocumentationMixin:
    def dispatch(self, request, *args, **kwargs):
        if not settings.DOCS_ENABLED:
            raise Http404
        return super().dispatch(request, *args, **kwargs)


class OpenApiSchemaView(DevelopmentDocumentationMixin, SpectacularAPIView):
    renderer_classes = (OpenApiJsonRenderer,)


class SwaggerUIView(DevelopmentDocumentationMixin, SpectacularSwaggerView):
    pass
