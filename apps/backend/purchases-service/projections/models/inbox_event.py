from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Q, UniqueConstraint
from django.utils import timezone

from projections.models.choices import InboxOutcome


class InboxEvent(models.Model):
    event_id = models.UUIDField(primary_key=True, editable=False)
    consumer_group = models.CharField(max_length=128)
    topic = models.CharField(max_length=255)
    partition_number = models.IntegerField()
    offset_value = models.BigIntegerField()
    aggregate_id = models.UUIDField()
    event_type = models.CharField(max_length=64)
    schema_version = models.SmallIntegerField()
    entity_version = models.BigIntegerField()
    correlation_id = models.UUIDField()
    event_occurred_at = models.DateTimeField()
    payload_hash = models.CharField(max_length=64)
    outcome = models.CharField(
        max_length=24,
        choices=InboxOutcome.choices,
    )
    processed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "inbox_events"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            UniqueConstraint(
                fields=["consumer_group", "topic", "partition_number", "offset_value"],
                name="uq_inbox_group_topic_part_off",
            ),
            CheckConstraint(
                condition=Q(partition_number__gte=0),
                name="chk_inbox_partition_nonneg",
            ),
            CheckConstraint(
                condition=Q(offset_value__gte=0),
                name="chk_inbox_offset_nonneg",
            ),
            CheckConstraint(
                condition=Q(schema_version__gte=1),
                name="chk_inbox_schema_ver_gte_one",
            ),
            CheckConstraint(
                condition=Q(entity_version__gte=1),
                name="chk_inbox_entity_ver_gte_one",
            ),
            CheckConstraint(
                condition=Q(
                    outcome__in=[
                        InboxOutcome.APPLIED,
                        InboxOutcome.IGNORED_STALE,
                    ]
                ),
                name="chk_inbox_outcome_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"InboxEvent({self.event_id}, type={self.event_type}, outcome={self.outcome})"
