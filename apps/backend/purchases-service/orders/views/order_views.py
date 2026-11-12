import uuid
from typing import Any

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from core.api_response import paginated_response, success_response
from core.audit_context import get_current_request_id
from core.authentication import AuthenticatedActor
from orders.serializers import (
    CancelPurchaseOrderDocSerializer,
    CreatePurchaseOrderDocSerializer,
    PurchaseOrderEnvelopeDocSerializer,
    PurchaseOrderHistoryEnvelopeDocSerializer,
    PurchaseOrderListEnvelopeDocSerializer,
    SubmitPurchaseOrderDocSerializer,
    UpdatePurchaseOrderDocSerializer,
)
from orders.services import (
    cancel_purchase_order,
    create_purchase_order,
    get_purchase_order,
    list_purchase_order_history,
    list_purchase_orders,
    submit_purchase_order,
    update_purchase_order,
)


class PurchasesJwtAuthScheme(OpenApiAuthenticationExtension):
    target_class = "core.authentication.PurchasesJwtAuthentication"
    name = "bearerAuth"

    def get_security_definition(self, auto_schema: Any) -> dict[str, Any]:
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }


IDEMPOTENCY_KEY_HEADER_PARAM = OpenApiParameter(
    name="Idempotency-Key",
    type=OpenApiTypes.UUID,
    location=OpenApiParameter.HEADER,
    required=True,
    description="Clave UUID de idempotencia única por solicitante y operación.",
)

ORDER_ID_PATH_PARAM = OpenApiParameter(
    name="id",
    type=OpenApiTypes.UUID,
    location=OpenApiParameter.PATH,
    required=True,
    description="Identificador UUID de la orden de compra.",
)


def _extract_idempotency_key(request: Request) -> str | None:
    return request.headers.get("Idempotency-Key") or request.META.get("HTTP_IDEMPOTENCY_KEY")


def _extract_request_id(request: Request) -> uuid.UUID:
    req_id = getattr(request, "request_id", None)
    if isinstance(req_id, uuid.UUID):
        return req_id
    return get_current_request_id()


class PurchaseOrderViewSet(viewsets.ViewSet):
    """Endpoints REST del dominio de órdenes de compra bajo /api/purchases/orders."""

    lookup_field = "id"
    lookup_url_kwarg = "id"

    @extend_schema(
        summary="Listar órdenes de compra paginadas",
        parameters=[
            OpenApiParameter(
                name="page",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Número de página (>= 1).",
            ),
            OpenApiParameter(
                name="limit",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Tamaño de página (1..100, por defecto 20).",
            ),
            OpenApiParameter(
                name="status",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=["DRAFT", "SUBMITTED", "CANCELLED"],
                description="Filtro opcional por estado de la orden.",
            ),
            OpenApiParameter(
                name="requesterId",
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                required=False,
                description=(
                    "Filtro por solicitante (solo permitido para ADMIN o el propio agente)."
                ),
            ),
        ],
        responses={200: PurchaseOrderListEnvelopeDocSerializer},
    )
    def list(self, request: Request) -> Response:
        actor: AuthenticatedActor = request.user
        result = list_purchase_orders(
            actor=actor,
            query_params=request.query_params,
        )
        return paginated_response(
            items=result.items,
            page=result.page,
            limit=result.limit,
            total=result.total,
            message="Órdenes de compra obtenidas exitosamente",
        )

    @extend_schema(
        summary="Crear orden de compra en estado DRAFT",
        parameters=[IDEMPOTENCY_KEY_HEADER_PARAM],
        request=CreatePurchaseOrderDocSerializer,
        responses={201: PurchaseOrderEnvelopeDocSerializer},
    )
    def create(self, request: Request) -> Response:
        actor: AuthenticatedActor = request.user
        result = create_purchase_order(
            actor=actor,
            raw_idempotency_key=_extract_idempotency_key(request),
            raw_payload=request.data,
            request_id=_extract_request_id(request),
        )
        return Response(result.envelope, status=result.status_code)

    @extend_schema(
        summary="Consultar detalle de una orden de compra",
        parameters=[ORDER_ID_PATH_PARAM],
        responses={200: PurchaseOrderEnvelopeDocSerializer},
    )
    def retrieve(self, request: Request, id: str | None = None) -> Response:
        actor: AuthenticatedActor = request.user
        data = get_purchase_order(
            actor=actor,
            raw_order_id=id or "",
        )
        return success_response(
            data=data,
            message="Orden de compra obtenida exitosamente",
            status_code=status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Editar una orden de compra en estado DRAFT",
        parameters=[ORDER_ID_PATH_PARAM],
        request=UpdatePurchaseOrderDocSerializer,
        responses={200: PurchaseOrderEnvelopeDocSerializer},
    )
    def update(self, request: Request, id: str | None = None) -> Response:
        actor: AuthenticatedActor = request.user
        data = update_purchase_order(
            actor=actor,
            raw_order_id=id or "",
            raw_payload=request.data,
            request_id=_extract_request_id(request),
        )
        return success_response(
            data=data,
            message="Orden de compra actualizada exitosamente",
            status_code=status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Enviar y congelar una orden de compra DRAFT",
        parameters=[ORDER_ID_PATH_PARAM, IDEMPOTENCY_KEY_HEADER_PARAM],
        request=SubmitPurchaseOrderDocSerializer,
        responses={200: PurchaseOrderEnvelopeDocSerializer},
    )
    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request: Request, id: str | None = None) -> Response:
        actor: AuthenticatedActor = request.user
        result = submit_purchase_order(
            actor=actor,
            raw_order_id=id or "",
            raw_idempotency_key=_extract_idempotency_key(request),
            raw_payload=request.data,
            request_id=_extract_request_id(request),
        )
        return Response(result.envelope, status=result.status_code)

    @extend_schema(
        summary="Cancelar una orden de compra DRAFT o SUBMITTED",
        parameters=[ORDER_ID_PATH_PARAM, IDEMPOTENCY_KEY_HEADER_PARAM],
        request=CancelPurchaseOrderDocSerializer,
        responses={200: PurchaseOrderEnvelopeDocSerializer},
    )
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request: Request, id: str | None = None) -> Response:
        actor: AuthenticatedActor = request.user
        result = cancel_purchase_order(
            actor=actor,
            raw_order_id=id or "",
            raw_idempotency_key=_extract_idempotency_key(request),
            raw_payload=request.data,
            request_id=_extract_request_id(request),
        )
        return Response(result.envelope, status=result.status_code)

    @extend_schema(
        summary="Consultar historial auditable de versiones de una orden",
        parameters=[ORDER_ID_PATH_PARAM],
        responses={200: PurchaseOrderHistoryEnvelopeDocSerializer},
    )
    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request: Request, id: str | None = None) -> Response:
        actor: AuthenticatedActor = request.user
        entries = list_purchase_order_history(
            actor=actor,
            raw_order_id=id or "",
        )
        return success_response(
            data=entries,
            message="Historial de la orden obtenido exitosamente",
            status_code=status.HTTP_200_OK,
        )
