import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

from core.exceptions import (
    DomainValidationError,
    FieldErrorDetail,
    IdempotencyConflictError,
)
from orders.models import IdempotencyKey, PurchaseOrder


@dataclass(frozen=True, slots=True)
class IdempotentReplay:
    status_code: int
    response_body: dict[str, Any]


def parse_idempotency_key_header(raw_header: str | None) -> uuid.UUID:
    if raw_header is None or not str(raw_header).strip():
        raise DomainValidationError(
            "El encabezado Idempotency-Key es obligatorio",
            details=[
                FieldErrorDetail(
                    field="Idempotency-Key",
                    code="MISSING_IDEMPOTENCY_KEY",
                    message="Debe enviar un UUID válido en el encabezado Idempotency-Key",
                )
            ],
        )
    try:
        return uuid.UUID(str(raw_header).strip())
    except ValueError as exc:
        raise DomainValidationError(
            "El encabezado Idempotency-Key es inválido",
            details=[
                FieldErrorDetail(
                    field="Idempotency-Key",
                    code="INVALID_IDEMPOTENCY_KEY",
                    message="El encabezado Idempotency-Key debe tener formato UUID",
                )
            ],
        ) from exc


def compute_canonical_request_hash(
    *,
    operation: str,
    canonical_payload: dict[str, Any],
    order_id: uuid.UUID | None = None,
) -> str:
    envelope = {
        "operation": operation,
        "orderId": str(order_id) if order_id is not None else None,
        "payload": canonical_payload,
    }
    encoded = json.dumps(
        envelope,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def check_existing_idempotency_key(
    *,
    requester_id: uuid.UUID,
    idempotency_key: uuid.UUID,
    operation: str,
    request_hash: str,
    order_id: uuid.UUID | None = None,
    lock_row: bool = False,
) -> IdempotentReplay | None:
    queryset = IdempotencyKey.objects.filter(
        requester_id=requester_id,
        idempotency_key=idempotency_key,
    )
    if lock_row:
        queryset = queryset.select_for_update()

    existing = queryset.first()
    if existing is None:
        return None

    if existing.operation != operation:
        raise IdempotencyConflictError(
            "La clave de idempotencia ya fue utilizada para otra operación"
        )

    if order_id is not None and existing.order_id != order_id:
        raise IdempotencyConflictError(
            "La clave de idempotencia ya fue utilizada para otra orden de compra"
        )

    if existing.request_hash != request_hash:
        raise IdempotencyConflictError(
            "La clave de idempotencia ya fue utilizada con un cuerpo de solicitud distinto"
        )

    return IdempotentReplay(
        status_code=int(existing.response_status),
        response_body=dict(existing.response_body),
    )


def save_idempotency_record(
    *,
    requester_id: uuid.UUID,
    idempotency_key: uuid.UUID,
    operation: str,
    order: PurchaseOrder,
    request_hash: str,
    response_status: int,
    response_body: dict[str, Any],
) -> IdempotencyKey:
    return IdempotencyKey.objects.create(
        requester_id=requester_id,
        idempotency_key=idempotency_key,
        operation=operation,
        order=order,
        request_hash=request_hash,
        response_status=response_status,
        response_body=response_body,
    )
