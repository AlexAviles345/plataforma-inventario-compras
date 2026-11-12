import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from rest_framework import serializers

from core.exceptions import DomainValidationError, FieldErrorDetail
from orders.serializers.common import (
    MAX_NUMERIC_18_2,
    MAX_ORDER_LINES,
    parse_exact_unit_price,
    parse_strict_positive_int,
    parse_uuid_value,
)


@dataclass(frozen=True, slots=True)
class ValidatedOrderLineInput:
    position: int
    product_id: uuid.UUID
    quantity: int
    unit_price: Decimal
    line_total: Decimal


@dataclass(frozen=True, slots=True)
class ValidatedCreateOrderInput:
    supplier_name: str
    lines: list[ValidatedOrderLineInput]
    total_amount: Decimal


@dataclass(frozen=True, slots=True)
class ValidatedUpdateOrderInput:
    expected_version: int
    supplier_name: str
    lines: list[ValidatedOrderLineInput]
    total_amount: Decimal


@dataclass(frozen=True, slots=True)
class ValidatedOrderTransitionInput:
    expected_version: int
    reason: str | None = None


def _validate_supplier_name(raw_payload: dict[str, Any]) -> str:
    if "requesterId" in raw_payload or "requester_id" in raw_payload:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field="requesterId",
                    code="FORBIDDEN_FIELD",
                    message="No se permite especificar requesterId; se deriva del token JWT",
                )
            ],
        )

    raw_supplier = raw_payload.get("supplierName")
    if not isinstance(raw_supplier, str):
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field="supplierName",
                    code="INVALID_SUPPLIER_NAME",
                    message="El nombre del proveedor es obligatorio y debe ser texto",
                )
            ],
        )
    supplier_name = raw_supplier.strip()
    if len(supplier_name) < 1 or len(supplier_name) > 200:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field="supplierName",
                    code="INVALID_SUPPLIER_NAME",
                    message="El nombre del proveedor debe tener entre 1 y 200 caracteres",
                )
            ],
        )
    return supplier_name


def _validate_lines(raw_lines: Any) -> tuple[list[ValidatedOrderLineInput], Decimal]:
    if not isinstance(raw_lines, list) or len(raw_lines) == 0:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field="lines",
                    code="EMPTY_ORDER_LINES",
                    message="La orden debe incluir al menos una línea",
                )
            ],
        )

    if len(raw_lines) > MAX_ORDER_LINES:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field="lines",
                    code="MAX_LINES_EXCEEDED",
                    message=f"La orden no puede exceder {MAX_ORDER_LINES} líneas",
                )
            ],
        )

    seen_products: set[uuid.UUID] = set()
    validated_lines: list[ValidatedOrderLineInput] = []
    running_total = Decimal("0.00")

    for idx, raw_line in enumerate(raw_lines):
        prefix = f"lines[{idx}]"
        if not isinstance(raw_line, dict):
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field=prefix,
                        code="INVALID_LINE_OBJECT",
                        message="Cada línea debe ser un objeto JSON",
                    )
                ],
            )

        allowed_keys = {"productId", "quantity", "unitPrice"}
        extra_keys = set(raw_line.keys()) - allowed_keys
        if extra_keys:
            first_extra = sorted(extra_keys)[0]
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field=f"{prefix}.{first_extra}",
                        code="UNKNOWN_FIELD",
                        message=f"Campo no permitido en línea de orden: {first_extra}",
                    )
                ],
            )

        product_id = parse_uuid_value(
            raw_line.get("productId"),
            field_name=f"{prefix}.productId",
        )
        if product_id in seen_products:
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field=f"{prefix}.productId",
                        code="DUPLICATE_PRODUCT_LINE",
                        message=(
                            "El mismo producto no puede repetirse en múltiples líneas de la orden"
                        ),
                    )
                ],
            )
        seen_products.add(product_id)

        quantity = parse_strict_positive_int(
            raw_line.get("quantity"),
            field_name=f"{prefix}.quantity",
            code="INVALID_QUANTITY",
            min_value=1,
            max_value=1_000_000_000,
        )
        unit_price = parse_exact_unit_price(
            raw_line.get("unitPrice"),
            field_name=f"{prefix}.unitPrice",
        )

        line_total = (Decimal(quantity) * unit_price).quantize(Decimal("0.01"))
        if line_total > MAX_NUMERIC_18_2:
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field=f"{prefix}.unitPrice",
                        code="DECIMAL_OVERFLOW",
                        message="El importe de la línea excede la capacidad máxima (18,2)",
                    )
                ],
            )

        running_total = (running_total + line_total).quantize(Decimal("0.01"))
        if running_total > MAX_NUMERIC_18_2:
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field="lines",
                        code="DECIMAL_OVERFLOW",
                        message="El importe total de la orden excede la capacidad máxima (18,2)",
                    )
                ],
            )

        validated_lines.append(
            ValidatedOrderLineInput(
                position=idx + 1,
                product_id=product_id,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    return validated_lines, running_total


def validate_create_order_payload(raw_payload: Any) -> ValidatedCreateOrderInput:
    if not isinstance(raw_payload, dict):
        raise DomainValidationError(
            "El cuerpo de la solicitud debe ser un objeto JSON",
            details=[
                FieldErrorDetail(
                    code="INVALID_BODY",
                    message="Se esperaba un objeto JSON",
                )
            ],
        )

    allowed_keys = {"supplierName", "lines", "requesterId", "requester_id"}
    extra_keys = set(raw_payload.keys()) - allowed_keys
    if extra_keys:
        first_extra = sorted(extra_keys)[0]
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=first_extra,
                    code="UNKNOWN_FIELD",
                    message=f"Campo no permitido: {first_extra}",
                )
            ],
        )

    supplier_name = _validate_supplier_name(raw_payload)
    lines, total_amount = _validate_lines(raw_payload.get("lines"))
    return ValidatedCreateOrderInput(
        supplier_name=supplier_name,
        lines=lines,
        total_amount=total_amount,
    )


def validate_update_order_payload(raw_payload: Any) -> ValidatedUpdateOrderInput:
    if not isinstance(raw_payload, dict):
        raise DomainValidationError(
            "El cuerpo de la solicitud debe ser un objeto JSON",
            details=[
                FieldErrorDetail(
                    code="INVALID_BODY",
                    message="Se esperaba un objeto JSON",
                )
            ],
        )

    allowed_keys = {"expectedVersion", "supplierName", "lines", "requesterId", "requester_id"}
    extra_keys = set(raw_payload.keys()) - allowed_keys
    if extra_keys:
        first_extra = sorted(extra_keys)[0]
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=first_extra,
                    code="UNKNOWN_FIELD",
                    message=f"Campo no permitido: {first_extra}",
                )
            ],
        )

    supplier_name = _validate_supplier_name(raw_payload)
    expected_version = parse_strict_positive_int(
        raw_payload.get("expectedVersion"),
        field_name="expectedVersion",
        code="INVALID_EXPECTED_VERSION",
        min_value=1,
    )
    lines, total_amount = _validate_lines(raw_payload.get("lines"))
    return ValidatedUpdateOrderInput(
        expected_version=expected_version,
        supplier_name=supplier_name,
        lines=lines,
        total_amount=total_amount,
    )


def validate_transition_payload(
    raw_payload: Any,
    *,
    allow_reason: bool = False,
) -> ValidatedOrderTransitionInput:
    if not isinstance(raw_payload, dict):
        raise DomainValidationError(
            "El cuerpo de la solicitud debe ser un objeto JSON",
            details=[
                FieldErrorDetail(
                    code="INVALID_BODY",
                    message="Se esperaba un objeto JSON",
                )
            ],
        )

    allowed_keys = {"expectedVersion"} | ({"reason"} if allow_reason else set())
    extra_keys = set(raw_payload.keys()) - allowed_keys
    if extra_keys:
        first_extra = sorted(extra_keys)[0]
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=first_extra,
                    code="UNKNOWN_FIELD",
                    message=f"Campo no permitido: {first_extra}",
                )
            ],
        )

    expected_version = parse_strict_positive_int(
        raw_payload.get("expectedVersion"),
        field_name="expectedVersion",
        code="INVALID_EXPECTED_VERSION",
        min_value=1,
    )

    reason: str | None = None
    if allow_reason and raw_payload.get("reason") is not None:
        raw_reason = raw_payload.get("reason")
        if not isinstance(raw_reason, str):
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field="reason",
                        code="INVALID_REASON",
                        message="El motivo de cancelación debe ser texto",
                    )
                ],
            )
        cleaned_reason = raw_reason.strip()
        if len(cleaned_reason) > 500:
            raise DomainValidationError(
                "La solicitud contiene datos inválidos",
                details=[
                    FieldErrorDetail(
                        field="reason",
                        code="INVALID_REASON",
                        message="El motivo de cancelación no puede exceder 500 caracteres",
                    )
                ],
            )
        reason = cleaned_reason or None

    return ValidatedOrderTransitionInput(
        expected_version=expected_version,
        reason=reason,
    )


# Serializadores DRF declarativos para documentación OpenAPI (drf-spectacular)
class OrderLineWriteDocSerializer(serializers.Serializer):
    productId = serializers.UUIDField(help_text="UUID del producto en el catálogo de Inventory.")
    quantity = serializers.IntegerField(min_value=1, help_text="Cantidad entera positiva (> 0).")
    unitPrice = serializers.CharField(
        help_text=(
            "Precio unitario exacto como string decimal con máximo 2 decimales (ej. '1250.50')."
        )
    )


class CreatePurchaseOrderDocSerializer(serializers.Serializer):
    supplierName = serializers.CharField(min_length=1, max_length=200)
    lines = OrderLineWriteDocSerializer(many=True)


class UpdatePurchaseOrderDocSerializer(serializers.Serializer):
    expectedVersion = serializers.IntegerField(min_value=1)
    supplierName = serializers.CharField(min_length=1, max_length=200)
    lines = OrderLineWriteDocSerializer(many=True)


class SubmitPurchaseOrderDocSerializer(serializers.Serializer):
    expectedVersion = serializers.IntegerField(min_value=1)


class CancelPurchaseOrderDocSerializer(serializers.Serializer):
    expectedVersion = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
