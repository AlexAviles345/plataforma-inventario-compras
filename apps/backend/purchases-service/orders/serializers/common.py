import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from core.exceptions import DomainValidationError, FieldErrorDetail

MAX_NUMERIC_18_2 = Decimal("9999999999999999.99")
MIN_UNIT_PRICE = Decimal("0.01")
MAX_ORDER_LINES = 100
_DECIMAL_STRING_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?$")


def parse_uuid_value(raw_value: Any, *, field_name: str, code: str = "INVALID_UUID") -> uuid.UUID:
    if isinstance(raw_value, uuid.UUID):
        return raw_value
    if not isinstance(raw_value, str) or not raw_value.strip():
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code=code,
                    message="Debe ser un UUID válido",
                )
            ],
        )
    try:
        return uuid.UUID(raw_value.strip())
    except ValueError as exc:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code=code,
                    message="Debe ser un UUID válido",
                )
            ],
        ) from exc


def parse_strict_positive_int(
    raw_value: Any,
    *,
    field_name: str,
    code: str = "INVALID_INTEGER",
    min_value: int = 1,
    max_value: int | None = None,
) -> int:
    if isinstance(raw_value, bool) or not isinstance(raw_value, int):
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code=code,
                    message="Debe ser un número entero",
                )
            ],
        )
    if raw_value < min_value:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code=code,
                    message=f"Debe ser un entero mayor o igual a {min_value}",
                )
            ],
        )
    if max_value is not None and raw_value > max_value:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code=code,
                    message=f"No debe exceder {max_value}",
                )
            ],
        )
    return raw_value


def parse_exact_unit_price(raw_value: Any, *, field_name: str) -> Decimal:
    """Valida que unitPrice sea string decimal positivo con <= 2 decimales y <= numeric(18,2)."""
    if not isinstance(raw_value, str):
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code="INVALID_DECIMAL_TYPE",
                    message=(
                        "El precio unitario debe enviarse como cadena decimal exacta "
                        "(ej. '1250.50')"
                    ),
                )
            ],
        )

    cleaned = raw_value.strip()
    if not cleaned or not _DECIMAL_STRING_RE.match(cleaned):
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code="INVALID_DECIMAL_FORMAT",
                    message="El precio unitario no tiene un formato decimal válido",
                )
            ],
        )

    try:
        dec_value = Decimal(cleaned)
    except InvalidOperation as exc:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code="INVALID_DECIMAL_FORMAT",
                    message="El precio unitario no tiene un formato decimal válido",
                )
            ],
        ) from exc

    exponent = dec_value.as_tuple().exponent
    if not isinstance(exponent, int) or exponent < -2:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code="INVALID_DECIMAL_SCALE",
                    message="Debe contener como máximo dos decimales",
                )
            ],
        )

    if dec_value <= Decimal("0.00"):
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code="INVALID_UNIT_PRICE",
                    message="El precio unitario debe ser mayor que cero",
                )
            ],
        )

    if dec_value > MAX_NUMERIC_18_2:
        raise DomainValidationError(
            "La solicitud contiene datos inválidos",
            details=[
                FieldErrorDetail(
                    field=field_name,
                    code="DECIMAL_OVERFLOW",
                    message="El precio unitario excede la precisión máxima permitida (18,2)",
                )
            ],
        )

    return dec_value.quantize(Decimal("0.01"))


def format_decimal_money(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01')):.2f}"
