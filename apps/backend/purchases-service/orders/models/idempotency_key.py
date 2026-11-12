import uuid
from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Index, Q, UniqueConstraint
from django.utils import timezone

from orders.models.choices import IdempotencyOperation
from orders.models.purchase_order import PurchaseOrder


class IdempotencyKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requester_id = models.UUIDField()
    idempotency_key = models.UUIDField()
    operation = models.CharField(
        max_length=24,
        choices=IdempotencyOperation.choices,
    )
    order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.RESTRICT,
        related_name="idempotency_keys",
        db_column="order_id",
    )
    request_hash = models.CharField(max_length=64)
    response_status = models.SmallIntegerField()
    response_body = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "idempotency_keys"
        indexes: ClassVar[list[Index]] = [
            Index(
                fields=["order", "created_at"],
                name="idx_idem_order_created",
            ),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            UniqueConstraint(
                fields=["requester_id", "idempotency_key"],
                name="uq_idem_requester_key",
            ),
            CheckConstraint(
                condition=Q(
                    operation__in=[
                        IdempotencyOperation.CREATE_ORDER,
                        IdempotencyOperation.SUBMIT_ORDER,
                        IdempotencyOperation.CANCEL_ORDER,
                    ]
                ),
                name="chk_idem_operation_valid",
            ),
            CheckConstraint(
                condition=Q(response_status__gte=100, response_status__lte=599),
                name="chk_idem_status_range",
            ),
        ]

    def __str__(self) -> str:
        return f"IdempotencyKey({self.requester_id}, key={self.idempotency_key})"
