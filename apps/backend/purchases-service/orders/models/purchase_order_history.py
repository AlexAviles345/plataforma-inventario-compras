import uuid
from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Index, Q, UniqueConstraint
from django.utils import timezone

from orders.models.choices import OrderHistoryAction, OrderStatus
from orders.models.purchase_order import PurchaseOrder


class PurchaseOrderHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.RESTRICT,
        related_name="history_entries",
        db_column="order_id",
    )
    order_version = models.BigIntegerField()
    action = models.CharField(
        max_length=24,
        choices=OrderHistoryAction.choices,
    )
    from_status = models.CharField(  # noqa: DJ001
        max_length=16,
        choices=OrderStatus.choices,
        null=True,
        blank=True,
    )
    to_status = models.CharField(
        max_length=16,
        choices=OrderStatus.choices,
    )
    actor_user_id = models.UUIDField()
    request_id = models.UUIDField()
    changes = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "purchase_order_history"
        indexes: ClassVar[list[Index]] = [
            Index(
                fields=["order", "created_at"],
                name="idx_poh_order_created",
            ),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            UniqueConstraint(
                fields=["order", "order_version"],
                name="uq_poh_order_version",
            ),
            CheckConstraint(
                condition=Q(order_version__gte=1),
                name="chk_poh_version_gte_one",
            ),
            CheckConstraint(
                condition=Q(
                    action__in=[
                        OrderHistoryAction.CREATED,
                        OrderHistoryAction.UPDATED,
                        OrderHistoryAction.SUBMITTED,
                        OrderHistoryAction.CANCELLED,
                    ]
                ),
                name="chk_poh_action_valid",
            ),
            CheckConstraint(
                condition=(
                    Q(from_status__isnull=True)
                    | Q(
                        from_status__in=[
                            OrderStatus.DRAFT,
                            OrderStatus.SUBMITTED,
                            OrderStatus.CANCELLED,
                        ]
                    )
                ),
                name="chk_poh_from_status_valid",
            ),
            CheckConstraint(
                condition=Q(
                    to_status__in=[
                        OrderStatus.DRAFT,
                        OrderStatus.SUBMITTED,
                        OrderStatus.CANCELLED,
                    ]
                ),
                name="chk_poh_to_status_valid",
            ),
            CheckConstraint(
                condition=(
                    Q(action=OrderHistoryAction.CREATED, from_status__isnull=True)
                    | (~Q(action=OrderHistoryAction.CREATED) & Q(from_status__isnull=False))
                ),
                name="chk_poh_created_from_status",
            ),
        ]

    def __str__(self) -> str:
        return f"PurchaseOrderHistory(order={self.order_id}, v={self.order_version})"
