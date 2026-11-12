import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from projections.models import ProductProjection, ProjectionProductUnit, UserProjection


@dataclass(frozen=True, slots=True)
class SnapshotBootstrapReport:
    domain: str
    applied_count: int
    skipped_stale_count: int
    watermarks: dict[int, int]


def _parse_iso_utc(raw_value: str | datetime) -> datetime:
    if isinstance(raw_value, datetime):
        return raw_value.astimezone(UTC)
    return datetime.fromisoformat(str(raw_value).replace("Z", "+00:00")).astimezone(UTC)


def import_projection_snapshot(
    *,
    domain: str,
    items: Sequence[dict[str, Any]],
    watermarks: dict[str | int, int] | None = None,
) -> SnapshotBootstrapReport:
    """Importa un snapshot consistente con versión monotónica y watermarks por partición."""
    if domain not in {"user", "product"}:
        raise ValueError("domain debe ser 'user' o 'product'")

    normalized_watermarks: dict[int, int] = {}
    for part, offset in (watermarks or {}).items():
        part_int = int(part)
        offset_int = int(offset)
        if part_int < 0 or offset_int < -1:
            raise ValueError("Las particiones y watermarks deben ser válidos")
        normalized_watermarks[part_int] = offset_int

    applied_count = 0
    skipped_stale_count = 0
    now = timezone.now()

    with transaction.atomic():
        for raw_item in items:
            entity_version = int(raw_item["entityVersion"])
            if entity_version < 1:
                raise ValueError("entityVersion en snapshot debe ser >= 1")

            source_event_id = uuid.UUID(str(raw_item.get("sourceEventId") or uuid.uuid4()))
            source_event_at = _parse_iso_utc(raw_item.get("sourceEventAt") or now)

            if domain == "user":
                user_id = uuid.UUID(str(raw_item["userId"]))
                existing_user = (
                    UserProjection.objects.select_for_update().filter(user_id=user_id).first()
                )
                if existing_user is not None and entity_version <= existing_user.entity_version:
                    skipped_stale_count += 1
                    continue

                email = str(raw_item["email"]).strip().lower()
                display_name = str(raw_item["displayName"]).strip()
                active = bool(raw_item["active"])
                assignments = list(raw_item["assignments"])

                if existing_user is None:
                    UserProjection.objects.create(
                        user_id=user_id,
                        email=email,
                        display_name=display_name,
                        active=active,
                        assignments=assignments,
                        entity_version=entity_version,
                        source_event_id=source_event_id,
                        source_event_at=source_event_at,
                        projected_at=now,
                    )
                else:
                    existing_user.email = email
                    existing_user.display_name = display_name
                    existing_user.active = active
                    existing_user.assignments = assignments
                    existing_user.entity_version = entity_version
                    existing_user.source_event_id = source_event_id
                    existing_user.source_event_at = source_event_at
                    existing_user.projected_at = now
                    existing_user.save()
                applied_count += 1
            else:
                product_id = uuid.UUID(str(raw_item["productId"]))
                existing_prod = (
                    ProductProjection.objects.select_for_update()
                    .filter(product_id=product_id)
                    .first()
                )
                if existing_prod is not None and entity_version <= existing_prod.entity_version:
                    skipped_stale_count += 1
                    continue

                sku = str(raw_item["sku"]).strip()
                name = str(raw_item["name"]).strip()
                stock_on_hand = int(raw_item["stockOnHand"])
                active = bool(raw_item["active"])
                created_by = uuid.UUID(str(raw_item["createdBy"]))
                updated_by = uuid.UUID(str(raw_item["updatedBy"]))

                if existing_prod is None:
                    ProductProjection.objects.create(
                        product_id=product_id,
                        sku=sku,
                        name=name,
                        unit=ProjectionProductUnit.UNIT,
                        stock_on_hand=stock_on_hand,
                        active=active,
                        created_by=created_by,
                        updated_by=updated_by,
                        entity_version=entity_version,
                        source_event_id=source_event_id,
                        source_event_at=source_event_at,
                        projected_at=now,
                    )
                else:
                    existing_prod.sku = sku
                    existing_prod.name = name
                    existing_prod.unit = ProjectionProductUnit.UNIT
                    existing_prod.stock_on_hand = stock_on_hand
                    existing_prod.active = active
                    existing_prod.created_by = created_by
                    existing_prod.updated_by = updated_by
                    existing_prod.entity_version = entity_version
                    existing_prod.source_event_id = source_event_id
                    existing_prod.source_event_at = source_event_at
                    existing_prod.projected_at = now
                    existing_prod.save()
                applied_count += 1

    return SnapshotBootstrapReport(
        domain=domain,
        applied_count=applied_count,
        skipped_stale_count=skipped_stale_count,
        watermarks=normalized_watermarks,
    )
