import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status

from core.api_response import parse_pagination_params
from core.authentication import AuthenticatedActor
from core.exceptions import (
    DomainValidationError,
    FieldErrorDetail,
    ForbiddenDomainError,
    OrderStateConflictError,
    ProductInactiveError,
    ProjectionNotReadyError,
    ResourceNotFoundError,
    VersionConflictError,
)
from core.permissions import ensure_order_ownership
from orders.models import (
    IdempotencyOperation,
    OrderCurrency,
    OrderHistoryAction,
    OrderStatus,
    ProductUnit,
    PurchaseOrder,
    PurchaseOrderHistory,
    PurchaseOrderLine,
)
from orders.serializers import (
    ValidatedOrderLineInput,
    format_decimal_money,
    parse_uuid_value,
    serialize_order_history_entry,
    serialize_purchase_order,
    validate_create_order_payload,
    validate_transition_payload,
    validate_update_order_payload,
)
from orders.services.idempotency_service import (
    check_existing_idempotency_key,
    compute_canonical_request_hash,
    parse_idempotency_key_header,
    save_idempotency_record,
)
from projections.models import ProductProjection


@dataclass(frozen=True, slots=True)
class OrderCommandExecutionResult:
    status_code: int
    envelope: dict[str, Any]
    replayed: bool = False


@dataclass(frozen=True, slots=True)
class PaginatedOrdersResult:
    items: list[dict[str, Any]]
    page: int
    limit: int
    total: int


def _load_projections_map(
    product_ids: Sequence[uuid.UUID],
) -> dict[uuid.UUID, ProductProjection]:
    if not product_ids:
        return {}
    projections = ProductProjection.objects.filter(product_id__in=set(product_ids))
    return {proj.product_id: proj for proj in projections}


def _resolve_active_product_projections(
    product_ids: Sequence[uuid.UUID],
) -> dict[uuid.UUID, ProductProjection]:
    projections_by_id = _load_projections_map(product_ids)

    for idx, product_id in enumerate(product_ids):
        projection = projections_by_id.get(product_id)
        if projection is None:
            raise ProjectionNotReadyError(
                "Uno o más productos aún no están disponibles en la proyección local de compras",
                details=[
                    FieldErrorDetail(
                        field=f"lines[{idx}].productId",
                        code="PROJECTION_NOT_READY",
                        message=f"La proyección del producto {product_id} aún no está sincronizada",
                    )
                ],
            )
        if not projection.active:
            raise ProductInactiveError(
                "No se puede operar una orden con productos inactivos",
                details=[
                    FieldErrorDetail(
                        field=f"lines[{idx}].productId",
                        code="PRODUCT_INACTIVE",
                        message=(
                            f"El producto {projection.sku} ({product_id}) se encuentra inactivo"
                        ),
                    )
                ],
            )

    return projections_by_id


def _build_success_envelope(
    *,
    status_code: int,
    message: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    return {
        "error": False,
        "statusCode": status_code,
        "message": message,
        "data": data,
    }


def _build_lines_audit_summary(lines: Sequence[PurchaseOrderLine]) -> list[dict[str, Any]]:
    return [
        {
            "position": line.position,
            "productId": str(line.product_id),
            "skuSnapshot": line.sku_snapshot,
            "nameSnapshot": line.name_snapshot,
            "unit": line.unit,
            "quantity": line.quantity,
            "unitPrice": format_decimal_money(line.unit_price),
            "lineTotal": format_decimal_money(line.line_total),
        }
        for line in lines
    ]


def _persist_order_lines(
    *,
    order: PurchaseOrder,
    validated_lines: Sequence[ValidatedOrderLineInput],
    projections_by_id: Mapping[uuid.UUID, ProductProjection],
    now: Any,
) -> list[PurchaseOrderLine]:
    created_lines: list[PurchaseOrderLine] = []
    for item in validated_lines:
        proj = projections_by_id[item.product_id]
        line = PurchaseOrderLine.objects.create(
            order=order,
            position=item.position,
            product_id=item.product_id,
            sku_snapshot=proj.sku,
            name_snapshot=proj.name,
            unit=ProductUnit.UNIT,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
            created_at=now,
            updated_at=now,
        )
        created_lines.append(line)
    return created_lines


def list_purchase_orders(
    *,
    actor: AuthenticatedActor,
    query_params: Mapping[str, Any],
) -> PaginatedOrdersResult:
    page, limit = parse_pagination_params(query_params)
    queryset = PurchaseOrder.objects.all()

    raw_status = query_params.get("status")
    if raw_status is not None and str(raw_status).strip() != "":
        status_value = str(raw_status).strip().upper()
        if status_value not in {
            OrderStatus.DRAFT,
            OrderStatus.SUBMITTED,
            OrderStatus.CANCELLED,
        }:
            raise DomainValidationError(
                "El filtro de estado es inválido",
                details=[
                    FieldErrorDetail(
                        field="status",
                        code="INVALID_STATUS_FILTER",
                        message="El estado debe ser DRAFT, SUBMITTED o CANCELLED",
                    )
                ],
            )
        queryset = queryset.filter(status=status_value)

    raw_requester = query_params.get("requesterId")
    if raw_requester is not None and str(raw_requester).strip() != "":
        filter_requester_id = parse_uuid_value(
            raw_requester,
            field_name="requesterId",
        )
        if actor.role != "ADMIN" and filter_requester_id != actor.user_id:
            raise ForbiddenDomainError(
                "No cuenta con permisos para consultar órdenes de otro usuario"
            )
        queryset = queryset.filter(requester_id=filter_requester_id)
    elif actor.role != "ADMIN":
        queryset = queryset.filter(requester_id=actor.user_id)

    total = queryset.count()
    offset = (page - 1) * limit
    orders = list(
        queryset.prefetch_related("lines").order_by("-created_at", "-id")[offset : offset + limit]
    )

    all_product_ids = [line.product_id for order in orders for line in order.lines.all()]
    projections_by_id = _load_projections_map(all_product_ids)

    serialized_items = [
        serialize_purchase_order(
            order,
            lines=sorted(order.lines.all(), key=lambda item: item.position),
            projections_by_id=projections_by_id,
        )
        for order in orders
    ]

    return PaginatedOrdersResult(
        items=serialized_items,
        page=page,
        limit=limit,
        total=total,
    )


def get_purchase_order(
    *,
    actor: AuthenticatedActor,
    raw_order_id: str | uuid.UUID,
) -> dict[str, Any]:
    order_id = parse_uuid_value(raw_order_id, field_name="orderId")
    order = PurchaseOrder.objects.prefetch_related("lines").filter(id=order_id).first()
    if order is None:
        raise ResourceNotFoundError("La orden de compra solicitada no existe")

    ensure_order_ownership(actor, order.requester_id)
    lines = sorted(order.lines.all(), key=lambda item: item.position)
    projections_by_id = _load_projections_map([line.product_id for line in lines])
    return serialize_purchase_order(
        order,
        lines=lines,
        projections_by_id=projections_by_id,
    )


def list_purchase_order_history(
    *,
    actor: AuthenticatedActor,
    raw_order_id: str | uuid.UUID,
) -> list[dict[str, Any]]:
    order_id = parse_uuid_value(raw_order_id, field_name="orderId")
    order = PurchaseOrder.objects.filter(id=order_id).first()
    if order is None:
        raise ResourceNotFoundError("La orden de compra solicitada no existe")

    ensure_order_ownership(actor, order.requester_id)
    entries = list(
        PurchaseOrderHistory.objects.filter(order_id=order.id).order_by(
            "order_version",
            "created_at",
        )
    )
    return [serialize_order_history_entry(entry) for entry in entries]


def create_purchase_order(
    *,
    actor: AuthenticatedActor,
    raw_idempotency_key: str | None,
    raw_payload: Any,
    request_id: uuid.UUID,
) -> OrderCommandExecutionResult:
    idempotency_key = parse_idempotency_key_header(raw_idempotency_key)
    validated = validate_create_order_payload(raw_payload)

    canonical_payload = {
        "supplierName": validated.supplier_name,
        "lines": [
            {
                "productId": str(line.product_id),
                "quantity": line.quantity,
                "unitPrice": format_decimal_money(line.unit_price),
            }
            for line in validated.lines
        ],
    }
    request_hash = compute_canonical_request_hash(
        operation=IdempotencyOperation.CREATE_ORDER,
        canonical_payload=canonical_payload,
    )

    existing_replay = check_existing_idempotency_key(
        requester_id=actor.user_id,
        idempotency_key=idempotency_key,
        operation=IdempotencyOperation.CREATE_ORDER,
        request_hash=request_hash,
    )
    if existing_replay is not None:
        return OrderCommandExecutionResult(
            status_code=existing_replay.status_code,
            envelope=existing_replay.response_body,
            replayed=True,
        )

    product_ids = [line.product_id for line in validated.lines]

    try:
        with transaction.atomic():
            projections_by_id = _resolve_active_product_projections(product_ids)
            now = timezone.now()

            order = PurchaseOrder.objects.create(
                requester_id=actor.user_id,
                supplier_name=validated.supplier_name,
                currency=OrderCurrency.MXN,
                status=OrderStatus.DRAFT,
                total_amount=validated.total_amount,
                version=1,
                last_modified_by=actor.user_id,
                submitted_at=None,
                cancelled_at=None,
                created_at=now,
                updated_at=now,
            )

            created_lines = _persist_order_lines(
                order=order,
                validated_lines=validated.lines,
                projections_by_id=projections_by_id,
                now=now,
            )

            PurchaseOrderHistory.objects.create(
                order=order,
                order_version=1,
                action=OrderHistoryAction.CREATED,
                from_status=None,
                to_status=OrderStatus.DRAFT,
                actor_user_id=actor.user_id,
                request_id=request_id,
                changes={
                    "supplierName": order.supplier_name,
                    "currency": order.currency,
                    "totalAmount": format_decimal_money(order.total_amount),
                    "lines": _build_lines_audit_summary(created_lines),
                },
                created_at=now,
            )

            serialized_order = serialize_purchase_order(
                order,
                lines=created_lines,
                projections_by_id=projections_by_id,
            )
            envelope = _build_success_envelope(
                status_code=status.HTTP_201_CREATED,
                message="Orden de compra creada exitosamente",
                data=serialized_order,
            )

            save_idempotency_record(
                requester_id=actor.user_id,
                idempotency_key=idempotency_key,
                operation=IdempotencyOperation.CREATE_ORDER,
                order=order,
                request_hash=request_hash,
                response_status=status.HTTP_201_CREATED,
                response_body=envelope,
            )
            return OrderCommandExecutionResult(
                status_code=status.HTTP_201_CREATED,
                envelope=envelope,
                replayed=False,
            )
    except IntegrityError:
        concurrent_replay = check_existing_idempotency_key(
            requester_id=actor.user_id,
            idempotency_key=idempotency_key,
            operation=IdempotencyOperation.CREATE_ORDER,
            request_hash=request_hash,
        )
        if concurrent_replay is not None:
            return OrderCommandExecutionResult(
                status_code=concurrent_replay.status_code,
                envelope=concurrent_replay.response_body,
                replayed=True,
            )
        raise


def update_purchase_order(
    *,
    actor: AuthenticatedActor,
    raw_order_id: str | uuid.UUID,
    raw_payload: Any,
    request_id: uuid.UUID,
) -> dict[str, Any]:
    order_id = parse_uuid_value(raw_order_id, field_name="orderId")
    validated = validate_update_order_payload(raw_payload)
    product_ids = [line.product_id for line in validated.lines]

    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().filter(id=order_id).first()
        if order is None:
            raise ResourceNotFoundError("La orden de compra solicitada no existe")

        ensure_order_ownership(actor, order.requester_id)

        if order.status != OrderStatus.DRAFT:
            raise OrderStateConflictError(
                f"No se puede editar una orden en estado {order.status}; "
                "solo las órdenes DRAFT admiten modificaciones"
            )

        if order.version != validated.expected_version:
            raise VersionConflictError("La versión de la orden no coincide con expectedVersion")

        projections_by_id = _resolve_active_product_projections(product_ids)
        now = timezone.now()
        new_version = validated.expected_version + 1

        order.lines.all().delete()
        updated_lines = _persist_order_lines(
            order=order,
            validated_lines=validated.lines,
            projections_by_id=projections_by_id,
            now=now,
        )

        updated_rows = PurchaseOrder.objects.filter(
            id=order.id,
            version=validated.expected_version,
        ).update(
            supplier_name=validated.supplier_name,
            total_amount=validated.total_amount,
            version=new_version,
            last_modified_by=actor.user_id,
            updated_at=now,
        )
        if updated_rows == 0:
            raise VersionConflictError(
                "La orden fue modificada concurrentemente por otra operación"
            )

        order.refresh_from_db()

        PurchaseOrderHistory.objects.create(
            order=order,
            order_version=new_version,
            action=OrderHistoryAction.UPDATED,
            from_status=OrderStatus.DRAFT,
            to_status=OrderStatus.DRAFT,
            actor_user_id=actor.user_id,
            request_id=request_id,
            changes={
                "supplierName": order.supplier_name,
                "totalAmount": format_decimal_money(order.total_amount),
                "lines": _build_lines_audit_summary(updated_lines),
            },
            created_at=now,
        )

        return serialize_purchase_order(
            order,
            lines=updated_lines,
            projections_by_id=projections_by_id,
        )


def submit_purchase_order(
    *,
    actor: AuthenticatedActor,
    raw_order_id: str | uuid.UUID,
    raw_idempotency_key: str | None,
    raw_payload: Any,
    request_id: uuid.UUID,
) -> OrderCommandExecutionResult:
    order_id = parse_uuid_value(raw_order_id, field_name="orderId")
    idempotency_key = parse_idempotency_key_header(raw_idempotency_key)
    validated = validate_transition_payload(raw_payload, allow_reason=False)

    request_hash = compute_canonical_request_hash(
        operation=IdempotencyOperation.SUBMIT_ORDER,
        order_id=order_id,
        canonical_payload={"expectedVersion": validated.expected_version},
    )

    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().filter(id=order_id).first()
        if order is None:
            raise ResourceNotFoundError("La orden de compra solicitada no existe")

        ensure_order_ownership(actor, order.requester_id)

        existing_replay = check_existing_idempotency_key(
            requester_id=actor.user_id,
            idempotency_key=idempotency_key,
            operation=IdempotencyOperation.SUBMIT_ORDER,
            request_hash=request_hash,
            order_id=order.id,
            lock_row=True,
        )
        if existing_replay is not None:
            return OrderCommandExecutionResult(
                status_code=existing_replay.status_code,
                envelope=existing_replay.response_body,
                replayed=True,
            )

        if order.status != OrderStatus.DRAFT:
            raise OrderStateConflictError(
                f"No se puede enviar una orden en estado {order.status}; "
                "solo las órdenes DRAFT pueden enviarse"
            )

        if order.version != validated.expected_version:
            raise VersionConflictError("La versión de la orden no coincide con expectedVersion")

        lines = list(order.lines.select_for_update().order_by("position"))
        if not lines:
            raise DomainValidationError(
                "La orden no contiene líneas para enviar",
                details=[
                    FieldErrorDetail(
                        field="lines",
                        code="EMPTY_ORDER_LINES",
                        message="La orden debe contener al menos una línea",
                    )
                ],
            )

        projections_by_id = _resolve_active_product_projections([line.product_id for line in lines])
        now = timezone.now()
        new_version = validated.expected_version + 1

        updated_rows = PurchaseOrder.objects.filter(
            id=order.id,
            version=validated.expected_version,
        ).update(
            status=OrderStatus.SUBMITTED,
            submitted_at=now,
            version=new_version,
            last_modified_by=actor.user_id,
            updated_at=now,
        )
        if updated_rows == 0:
            raise VersionConflictError(
                "La orden fue modificada concurrentemente por otra operación"
            )

        order.refresh_from_db()

        PurchaseOrderHistory.objects.create(
            order=order,
            order_version=new_version,
            action=OrderHistoryAction.SUBMITTED,
            from_status=OrderStatus.DRAFT,
            to_status=OrderStatus.SUBMITTED,
            actor_user_id=actor.user_id,
            request_id=request_id,
            changes={
                "submittedAt": order.submitted_at.isoformat() if order.submitted_at else None,
                "totalAmount": format_decimal_money(order.total_amount),
                "frozenLines": _build_lines_audit_summary(lines),
            },
            created_at=now,
        )

        serialized_order = serialize_purchase_order(
            order,
            lines=lines,
            projections_by_id=projections_by_id,
        )
        envelope = _build_success_envelope(
            status_code=status.HTTP_200_OK,
            message="Orden de compra enviada exitosamente",
            data=serialized_order,
        )

        save_idempotency_record(
            requester_id=actor.user_id,
            idempotency_key=idempotency_key,
            operation=IdempotencyOperation.SUBMIT_ORDER,
            order=order,
            request_hash=request_hash,
            response_status=status.HTTP_200_OK,
            response_body=envelope,
        )
        return OrderCommandExecutionResult(
            status_code=status.HTTP_200_OK,
            envelope=envelope,
            replayed=False,
        )


def cancel_purchase_order(
    *,
    actor: AuthenticatedActor,
    raw_order_id: str | uuid.UUID,
    raw_idempotency_key: str | None,
    raw_payload: Any,
    request_id: uuid.UUID,
) -> OrderCommandExecutionResult:
    order_id = parse_uuid_value(raw_order_id, field_name="orderId")
    idempotency_key = parse_idempotency_key_header(raw_idempotency_key)
    validated = validate_transition_payload(raw_payload, allow_reason=True)

    canonical_payload: dict[str, Any] = {
        "expectedVersion": validated.expected_version,
    }
    if validated.reason is not None:
        canonical_payload["reason"] = validated.reason

    request_hash = compute_canonical_request_hash(
        operation=IdempotencyOperation.CANCEL_ORDER,
        order_id=order_id,
        canonical_payload=canonical_payload,
    )

    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().filter(id=order_id).first()
        if order is None:
            raise ResourceNotFoundError("La orden de compra solicitada no existe")

        ensure_order_ownership(actor, order.requester_id)

        existing_replay = check_existing_idempotency_key(
            requester_id=actor.user_id,
            idempotency_key=idempotency_key,
            operation=IdempotencyOperation.CANCEL_ORDER,
            request_hash=request_hash,
            order_id=order.id,
            lock_row=True,
        )
        if existing_replay is not None:
            return OrderCommandExecutionResult(
                status_code=existing_replay.status_code,
                envelope=existing_replay.response_body,
                replayed=True,
            )

        if order.status == OrderStatus.CANCELLED:
            raise OrderStateConflictError("La orden ya se encuentra en estado CANCELLED")

        if order.version != validated.expected_version:
            raise VersionConflictError("La versión de la orden no coincide con expectedVersion")

        previous_status = order.status
        now = timezone.now()
        new_version = validated.expected_version + 1

        updated_rows = PurchaseOrder.objects.filter(
            id=order.id,
            version=validated.expected_version,
        ).update(
            status=OrderStatus.CANCELLED,
            cancelled_at=now,
            version=new_version,
            last_modified_by=actor.user_id,
            updated_at=now,
        )
        if updated_rows == 0:
            raise VersionConflictError(
                "La orden fue modificada concurrentemente por otra operación"
            )

        order.refresh_from_db()
        lines = list(order.lines.all().order_by("position"))
        projections_by_id = _load_projections_map([line.product_id for line in lines])

        changes_payload: dict[str, Any] = {
            "cancelledAt": order.cancelled_at.isoformat() if order.cancelled_at else None,
            "previousStatus": previous_status,
        }
        if validated.reason is not None:
            changes_payload["reason"] = validated.reason

        PurchaseOrderHistory.objects.create(
            order=order,
            order_version=new_version,
            action=OrderHistoryAction.CANCELLED,
            from_status=previous_status,
            to_status=OrderStatus.CANCELLED,
            actor_user_id=actor.user_id,
            request_id=request_id,
            changes=changes_payload,
            created_at=now,
        )

        serialized_order = serialize_purchase_order(
            order,
            lines=lines,
            projections_by_id=projections_by_id,
        )
        envelope = _build_success_envelope(
            status_code=status.HTTP_200_OK,
            message="Orden de compra cancelada exitosamente",
            data=serialized_order,
        )

        save_idempotency_record(
            requester_id=actor.user_id,
            idempotency_key=idempotency_key,
            operation=IdempotencyOperation.CANCEL_ORDER,
            order=order,
            request_hash=request_hash,
            response_status=status.HTTP_200_OK,
            response_body=envelope,
        )
        return OrderCommandExecutionResult(
            status_code=status.HTTP_200_OK,
            envelope=envelope,
            replayed=False,
        )
