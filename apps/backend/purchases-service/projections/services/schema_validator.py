import functools
import json
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from django.conf import settings
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema import ValidationError as JsonSchemaError
from referencing import Registry, Resource

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_ISO_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")

EMBEDDED_EVENT_ENVELOPE_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://techdistribution.local/contracts/event-envelope.schema.json",
    "title": "Domain event v1",
    "type": "object",
    "required": [
        "eventId",
        "eventType",
        "schemaVersion",
        "aggregateId",
        "entityVersion",
        "timestamp",
        "correlationId",
        "data",
    ],
    "properties": {
        "eventId": {"type": "string", "format": "uuid"},
        "eventType": {
            "enum": [
                "UserCreated",
                "UserUpdated",
                "ProductCreated",
                "ProductUpdated",
            ]
        },
        "schemaVersion": {"const": 1},
        "aggregateId": {"type": "string", "format": "uuid"},
        "entityVersion": {"type": "integer", "minimum": 1},
        "timestamp": {"type": "string", "format": "date-time", "pattern": "Z$"},
        "correlationId": {"type": "string", "format": "uuid"},
        "data": {"type": "object"},
    },
    "additionalProperties": False,
}

EMBEDDED_USER_EVENT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://techdistribution.local/contracts/user-event.schema.json",
    "title": "Public user snapshot v1",
    "type": "object",
    "allOf": [
        {"$ref": "event-envelope.schema.json"},
        {
            "properties": {
                "eventType": {"enum": ["UserCreated", "UserUpdated"]},
                "data": {
                    "type": "object",
                    "required": [
                        "userId",
                        "email",
                        "displayName",
                        "active",
                        "assignments",
                    ],
                    "properties": {
                        "userId": {"type": "string", "format": "uuid"},
                        "email": {"type": "string", "format": "email"},
                        "displayName": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 200,
                        },
                        "active": {"type": "boolean"},
                        "assignments": {
                            "type": "array",
                            "maxItems": 2,
                            "uniqueItems": True,
                            "items": {
                                "type": "object",
                                "required": ["system", "role"],
                                "oneOf": [
                                    {
                                        "properties": {
                                            "system": {"const": "INVENTORY"},
                                            "role": {
                                                "enum": [
                                                    "ADMIN",
                                                    "INVENTORY_MANAGER",
                                                ]
                                            },
                                        }
                                    },
                                    {
                                        "properties": {
                                            "system": {"const": "PURCHASES"},
                                            "role": {
                                                "enum": [
                                                    "ADMIN",
                                                    "PURCHASES_AGENT",
                                                ]
                                            },
                                        }
                                    },
                                ],
                                "properties": {
                                    "system": {"type": "string"},
                                    "role": {"type": "string"},
                                },
                                "additionalProperties": False,
                            },
                        },
                    },
                    "additionalProperties": False,
                },
            }
        },
    ],
}

EMBEDDED_PRODUCT_EVENT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://techdistribution.local/contracts/product-event.schema.json",
    "title": "Public product snapshot v1",
    "type": "object",
    "allOf": [
        {"$ref": "event-envelope.schema.json"},
        {
            "properties": {
                "eventType": {"enum": ["ProductCreated", "ProductUpdated"]},
                "data": {
                    "type": "object",
                    "required": [
                        "productId",
                        "sku",
                        "name",
                        "unit",
                        "stockOnHand",
                        "active",
                        "createdBy",
                        "updatedBy",
                    ],
                    "properties": {
                        "productId": {"type": "string", "format": "uuid"},
                        "sku": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 64,
                        },
                        "name": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 200,
                        },
                        "unit": {"const": "UNIT"},
                        "stockOnHand": {"type": "integer", "minimum": 0},
                        "active": {"type": "boolean"},
                        "createdBy": {"type": "string", "format": "uuid"},
                        "updatedBy": {"type": "string", "format": "uuid"},
                    },
                    "additionalProperties": False,
                },
            }
        },
    ],
}


class PermanentEventValidationError(ValueError):
    """Error permanente de esquema o contrato que debe aislarse directamente en DLQ."""


@dataclass(frozen=True, slots=True)
class ValidatedDomainEvent:
    event_id: uuid.UUID
    event_type: str
    schema_version: int
    aggregate_id: uuid.UUID
    entity_version: int
    occurred_at: datetime
    correlation_id: uuid.UUID
    data: dict[str, Any]


def _build_format_checker() -> FormatChecker:
    checker = FormatChecker()

    @checker.checks("uuid")
    def _check_uuid(instance: object) -> bool:
        if not isinstance(instance, str):
            return True
        return bool(_UUID_RE.match(instance))

    @checker.checks("email")
    def _check_email(instance: object) -> bool:
        if not isinstance(instance, str):
            return True
        return bool(_EMAIL_RE.match(instance)) and len(instance) <= 254

    @checker.checks("date-time")
    def _check_datetime(instance: object) -> bool:
        if not isinstance(instance, str):
            return True
        if not _ISO_UTC_RE.match(instance):
            return False
        try:
            datetime.fromisoformat(instance.replace("Z", "+00:00"))
            return True
        except ValueError:
            return False

    return checker


def _load_schema_dict(filename: str, fallback: dict[str, Any]) -> dict[str, Any]:
    contracts_dir = Path(settings.BASE_DIR).parent.parent.parent / "contracts" / "events"
    candidate = contracts_dir / filename
    if candidate.is_file():
        return json.loads(candidate.read_text(encoding="utf-8"))
    return fallback


@functools.lru_cache(maxsize=1)
def _get_validators() -> dict[str, Draft202012Validator]:
    envelope_schema = _load_schema_dict(
        "event-envelope.schema.json",
        EMBEDDED_EVENT_ENVELOPE_SCHEMA,
    )
    user_schema = _load_schema_dict(
        "user-event.schema.json",
        EMBEDDED_USER_EVENT_SCHEMA,
    )
    product_schema = _load_schema_dict(
        "product-event.schema.json",
        EMBEDDED_PRODUCT_EVENT_SCHEMA,
    )

    registry = Registry().with_resources(
        [
            (
                envelope_schema["$id"],
                Resource.from_contents(envelope_schema),
            ),
            (
                "event-envelope.schema.json",
                Resource.from_contents(envelope_schema),
            ),
            (
                user_schema["$id"],
                Resource.from_contents(user_schema),
            ),
            (
                product_schema["$id"],
                Resource.from_contents(product_schema),
            ),
        ]
    )
    format_checker = _build_format_checker()
    return {
        "user": Draft202012Validator(
            user_schema,
            registry=registry,
            format_checker=format_checker,
        ),
        "product": Draft202012Validator(
            product_schema,
            registry=registry,
            format_checker=format_checker,
        ),
    }


def parse_and_validate_event(
    raw_payload: bytes | str | dict[str, Any],
    *,
    expected_domain: str,
    partition_key: str | bytes | None = None,
) -> ValidatedDomainEvent:
    if expected_domain not in {"user", "product"}:
        raise ValueError("expected_domain debe ser 'user' o 'product'")

    if isinstance(raw_payload, bytes):
        try:
            payload_obj = json.loads(raw_payload.decode("utf-8"))
        except Exception as exc:
            raise PermanentEventValidationError(
                "El mensaje recibido no es un JSON UTF-8 válido"
            ) from exc
    elif isinstance(raw_payload, str):
        try:
            payload_obj = json.loads(raw_payload)
        except Exception as exc:
            raise PermanentEventValidationError("El mensaje recibido no es un JSON válido") from exc
    elif isinstance(raw_payload, dict):
        payload_obj = raw_payload
    else:
        raise PermanentEventValidationError("Tipo de payload no soportado")

    if not isinstance(payload_obj, dict):
        raise PermanentEventValidationError("El evento debe ser un objeto JSON")

    validator = _get_validators()[expected_domain]
    try:
        validator.validate(payload_obj)
    except JsonSchemaError as exc:
        path = ".".join(str(part) for part in exc.absolute_path) or "root"
        raise PermanentEventValidationError(
            f"Violación de JSON Schema en '{path}': {exc.message}"
        ) from exc

    aggregate_id_str = payload_obj["aggregateId"]
    aggregate_uuid = uuid.UUID(aggregate_id_str)
    data = payload_obj["data"]

    if partition_key is not None:
        key_str = (
            partition_key.decode("utf-8", errors="replace")
            if isinstance(partition_key, bytes)
            else str(partition_key)
        ).strip()
        try:
            key_uuid = uuid.UUID(key_str)
        except ValueError as exc:
            raise PermanentEventValidationError("La key de Kafka no es un UUID válido") from exc
        if key_uuid != aggregate_uuid:
            raise PermanentEventValidationError("La key de Kafka no coincide con aggregateId")

    if expected_domain == "user":
        entity_uuid = uuid.UUID(data["userId"])
        if entity_uuid != aggregate_uuid:
            raise PermanentEventValidationError("aggregateId no coincide con data.userId")
        assignments = data["assignments"]
        systems = [item["system"] for item in assignments]
        if len(set(systems)) != len(systems):
            raise PermanentEventValidationError(
                "data.assignments contiene múltiples asignaciones para el mismo sistema"
            )
    else:
        entity_uuid = uuid.UUID(data["productId"])
        if entity_uuid != aggregate_uuid:
            raise PermanentEventValidationError("aggregateId no coincide con data.productId")

    occurred_at = datetime.fromisoformat(
        payload_obj["timestamp"].replace("Z", "+00:00")
    ).astimezone(UTC)

    return ValidatedDomainEvent(
        event_id=uuid.UUID(payload_obj["eventId"]),
        event_type=payload_obj["eventType"],
        schema_version=int(payload_obj["schemaVersion"]),
        aggregate_id=aggregate_uuid,
        entity_version=int(payload_obj["entityVersion"]),
        occurred_at=occurred_at,
        correlation_id=uuid.UUID(payload_obj["correlationId"]),
        data=dict(data),
    )
