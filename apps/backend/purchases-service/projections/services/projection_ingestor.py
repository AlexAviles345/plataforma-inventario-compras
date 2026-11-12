import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from projections.models import (
    InboxEvent,
    InboxOutcome,
    ProductProjection,
    ProjectionProductUnit,
    UserProjection,
)
from projections.services.schema_validator import (
    ValidatedDomainEvent,
    parse_and_validate_event,
)


@dataclass(frozen=True, slots=True)
class IngestionResult:
    event_id: uuid.UUID
    aggregate_id: uuid.UUID
    entity_version: int
    outcome: str
    duplicate: bool


def _compute_payload_hash(raw_payload: bytes | str | dict[str, Any]) -> str:
    if isinstance(raw_payload, bytes):
        raw_bytes = raw_payload
    elif isinstance(raw_payload, str):
        raw_bytes = raw_payload.encode("utf-8")
    else:
        raw_bytes = json.dumps(
            raw_payload,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    return hashlib.sha256(raw_bytes).hexdigest()


def _apply_user_snapshot(event: ValidatedDomainEvent, now: Any) -> str:
    existing = UserProjection.objects.select_for_update().filter(user_id=event.aggregate_id).first()
    data = event.data
    normalized_email = str(data["email"]).strip().lower()
    display_name = str(data["displayName"]).strip()

    if existing is None:
        UserProjection.objects.create(
            user_id=event.aggregate_id,
            email=normalized_email,
            display_name=display_name,
            active=bool(data["active"]),
            assignments=list(data["assignments"]),
            entity_version=event.entity_version,
            source_event_id=event.event_id,
            source_event_at=event.occurred_at,
            projected_at=now,
        )
        return InboxOutcome.APPLIED

    if event.entity_version <= existing.entity_version:
        return InboxOutcome.IGNORED_STALE

    existing.email = normalized_email
    existing.display_name = display_name
    existing.active = bool(data["active"])
    existing.assignments = list(data["assignments"])
    existing.entity_version = event.entity_version
    existing.source_event_id = event.event_id
    existing.source_event_at = event.occurred_at
    existing.projected_at = now
    existing.save()
    return InboxOutcome.APPLIED


def _apply_product_snapshot(event: ValidatedDomainEvent, now: Any) -> str:
    existing = (
        ProductProjection.objects.select_for_update().filter(product_id=event.aggregate_id).first()
    )
    data = event.data
    sku = str(data["sku"]).strip()
    name = str(data["name"]).strip()
    created_by = uuid.UUID(str(data["createdBy"]))
    updated_by = uuid.UUID(str(data["updatedBy"]))

    if existing is None:
        ProductProjection.objects.create(
            product_id=event.aggregate_id,
            sku=sku,
            name=name,
            unit=ProjectionProductUnit.UNIT,
            stock_on_hand=int(data["stockOnHand"]),
            active=bool(data["active"]),
            created_by=created_by,
            updated_by=updated_by,
            entity_version=event.entity_version,
            source_event_id=event.event_id,
            source_event_at=event.occurred_at,
            projected_at=now,
        )
        return InboxOutcome.APPLIED

    if event.entity_version <= existing.entity_version:
        return InboxOutcome.IGNORED_STALE

    existing.sku = sku
    existing.name = name
    existing.unit = ProjectionProductUnit.UNIT
    existing.stock_on_hand = int(data["stockOnHand"])
    existing.active = bool(data["active"])
    existing.created_by = created_by
    existing.updated_by = updated_by
    existing.entity_version = event.entity_version
    existing.source_event_id = event.event_id
    existing.source_event_at = event.occurred_at
    existing.projected_at = now
    existing.save()
    return InboxOutcome.APPLIED


def ingest_domain_event(
    *,
    raw_payload: bytes | str | dict[str, Any],
    expected_domain: str,
    consumer_group: str,
    topic: str,
    partition_number: int,
    offset_value: int,
    partition_key: str | bytes | None = None,
) -> IngestionResult:
    payload_hash = _compute_payload_hash(raw_payload)
    event = parse_and_validate_event(
        raw_payload,
        expected_domain=expected_domain,
        partition_key=partition_key,
    )

    with transaction.atomic():
        existing_inbox = (
            InboxEvent.objects.select_for_update()
            .filter(
                Q(event_id=event.event_id)
                | Q(
                    consumer_group=consumer_group,
                    topic=topic,
                    partition_number=partition_number,
                    offset_value=offset_value,
                )
            )
            .first()
        )
        if existing_inbox is not None:
            return IngestionResult(
                event_id=existing_inbox.event_id,
                aggregate_id=existing_inbox.aggregate_id,
                entity_version=existing_inbox.entity_version,
                outcome=existing_inbox.outcome,
                duplicate=True,
            )

        now = timezone.now()
        if expected_domain == "user":
            outcome = _apply_user_snapshot(event, now)
        else:
            outcome = _apply_product_snapshot(event, now)

        InboxEvent.objects.create(
            event_id=event.event_id,
            consumer_group=consumer_group,
            topic=topic,
            partition_number=partition_number,
            offset_value=offset_value,
            aggregate_id=event.aggregate_id,
            event_type=event.event_type,
            schema_version=event.schema_version,
            entity_version=event.entity_version,
            correlation_id=event.correlation_id,
            event_occurred_at=event.occurred_at,
            payload_hash=payload_hash,
            outcome=outcome,
            processed_at=now,
        )

        return IngestionResult(
            event_id=event.event_id,
            aggregate_id=event.aggregate_id,
            entity_version=event.entity_version,
            outcome=outcome,
            duplicate=False,
        )
