from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView


class LiveHealthView(APIView):
    authentication_classes = ()
    permission_classes = ()

    @extend_schema(exclude=True)
    def get(self, request):
        return Response({"status": "ok", "service": "purchases-service"})


class ReadyHealthView(APIView):
    authentication_classes = ()
    permission_classes = ()

    @extend_schema(exclude=True)
    def get(self, request):
        return Response({"status": "ready", "service": "purchases-service"})
