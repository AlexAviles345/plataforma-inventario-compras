import uuid
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from rest_framework import serializers

from orders.models import PurchaseOrder, PurchaseOrderHistory, PurchaseOrderLine
from orders.serializers.common import format_decimal_money
from projections.models import ProductProjection


def _format_utc_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def serialize_order_line(
    line: PurchaseOrderLine,
    *,
    current_projection: ProductProjection | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(line.id),
        "position": line.position,
        "productId": str(line.product_id),
        "skuSnapshot": line.sku_snapshot,
        "nameSnapshot": line.name_snapshot,
        "unit": line.unit,
        "quantity": line.quantity,
        "unitPrice": format_decimal_money(line.unit_price),
        "lineTotal": format_decimal_money(line.line_total),
        "createdAt": _format_utc_iso(line.created_at),
        "updatedAt": _format_utc_iso(line.updated_at),
    }
    if current_projection is not None:
        payload["currentCatalog"] = {
            "sku": current_projection.sku,
            "name": current_projection.name,
            "unit": current_projection.unit,
            "active": current_projection.active,
            "stockOnHand": current_projection.stock_on_hand,
            "entityVersion": current_projection.entity_version,
        }
    return payload


def serialize_purchase_order(
    order: PurchaseOrder,
    *,
    lines: Iterable[PurchaseOrderLine] | None = None,
    projections_by_id: Mapping[uuid.UUID, ProductProjection] | None = None,
) -> dict[str, Any]:
    order_lines = list(lines) if lines is not None else list(order.lines.all().order_by("position"))
    proj_map = projections_by_id or {}
    return {
        "id": str(order.id),
        "requesterId": str(order.requester_id),
        "supplierName": order.supplier_name,
        "currency": order.currency,
        "status": order.status,
        "totalAmount": format_decimal_money(order.total_amount),
        "version": order.version,
        "lastModifiedBy": str(order.last_modified_by),
        "submittedAt": _format_utc_iso(order.submitted_at),
        "cancelledAt": _format_utc_iso(order.cancelled_at),
        "createdAt": _format_utc_iso(order.created_at),
        "updatedAt": _format_utc_iso(order.updated_at),
        "lines": [
            serialize_order_line(
                line,
                current_projection=proj_map.get(line.product_id),
            )
            for line in order_lines
        ],
    }


def serialize_order_history_entry(entry: PurchaseOrderHistory) -> dict[str, Any]:
    return {
        "id": str(entry.id),
        "orderId": str(entry.order_id),
        "orderVersion": entry.order_version,
        "action": entry.action,
        "fromStatus": entry.from_status,
        "toStatus": entry.to_status,
        "actorUserId": str(entry.actor_user_id),
        "requestId": str(entry.request_id),
        "changes": entry.changes,
        "createdAt": _format_utc_iso(entry.created_at),
    }


# Serializadores DRF declarativos para documentación OpenAPI (drf-spectacular)
class CurrentCatalogRefDocSerializer(serializers.Serializer):
    sku = serializers.CharField()
    name = serializers.CharField()
    unit = serializers.CharField()
    active = serializers.BooleanField()
    stockOnHand = serializers.IntegerField()
    entityVersion = serializers.IntegerField()


class PurchaseOrderLineReadDocSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    position = serializers.IntegerField()
    productId = serializers.UUIDField()
    skuSnapshot = serializers.CharField()
    nameSnapshot = serializers.CharField()
    unit = serializers.CharField()
    quantity = serializers.IntegerField()
    unitPrice = serializers.CharField()
    lineTotal = serializers.CharField()
    createdAt = serializers.CharField()
    updatedAt = serializers.CharField()
    currentCatalog = CurrentCatalogRefDocSerializer(required=False)


class PurchaseOrderReadDocSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    requesterId = serializers.UUIDField()
    supplierName = serializers.CharField()
    currency = serializers.CharField()
    status = serializers.ChoiceField(choices=["DRAFT", "SUBMITTED", "CANCELLED"])
    totalAmount = serializers.CharField()
    version = serializers.IntegerField()
    lastModifiedBy = serializers.UUIDField()
    submittedAt = serializers.CharField(allow_null=True)
    cancelledAt = serializers.CharField(allow_null=True)
    createdAt = serializers.CharField()
    updatedAt = serializers.CharField()
    lines = PurchaseOrderLineReadDocSerializer(many=True)


class PurchaseOrderHistoryReadDocSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    orderId = serializers.UUIDField()
    orderVersion = serializers.IntegerField()
    action = serializers.ChoiceField(choices=["CREATED", "UPDATED", "SUBMITTED", "CANCELLED"])
    fromStatus = serializers.CharField(allow_null=True)
    toStatus = serializers.CharField()
    actorUserId = serializers.UUIDField()
    requestId = serializers.UUIDField()
    changes = serializers.DictField()
    createdAt = serializers.CharField()


class PaginationMetaDocSerializer(serializers.Serializer):
    page = serializers.IntegerField()
    limit = serializers.IntegerField()
    total = serializers.IntegerField()
    totalPages = serializers.IntegerField()


class PurchaseOrderEnvelopeDocSerializer(serializers.Serializer):
    error = serializers.BooleanField(default=False)
    statusCode = serializers.IntegerField(default=200)
    message = serializers.CharField()
    data = PurchaseOrderReadDocSerializer()


class PurchaseOrderListEnvelopeDocSerializer(serializers.Serializer):
    error = serializers.BooleanField(default=False)
    statusCode = serializers.IntegerField(default=200)
    message = serializers.CharField()
    data = PurchaseOrderReadDocSerializer(many=True)
    meta = PaginationMetaDocSerializer()


class PurchaseOrderHistoryEnvelopeDocSerializer(serializers.Serializer):
    error = serializers.BooleanField(default=False)
    statusCode = serializers.IntegerField(default=200)
    message = serializers.CharField()
    data = PurchaseOrderHistoryReadDocSerializer(many=True)
