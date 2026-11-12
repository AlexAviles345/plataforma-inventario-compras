import uuid
from decimal import Decimal
from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Index, Q
from django.utils import timezone

from orders.models.choices import OrderCurrency, OrderStatus


class PurchaseOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requester_id = models.UUIDField()
    supplier_name = models.CharField(max_length=200)
    currency = models.CharField(
        max_length=3,
        choices=OrderCurrency.choices,
        default=OrderCurrency.MXN,
    )
    status = models.CharField(
        max_length=16,
        choices=OrderStatus.choices,
        default=OrderStatus.DRAFT,
    )
    total_amount = models.DecimalField(max_digits=18, decimal_places=2)
    version = models.BigIntegerField(default=1)
    last_modified_by = models.UUIDField()
    submitted_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "purchase_orders"
        indexes: ClassVar[list[Index]] = [
            Index(
                fields=["requester_id", "-created_at", "id"],
                name="idx_po_requester_created_id",
            ),
            Index(
                fields=["status", "-created_at", "id"],
                name="idx_po_status_created_id",
            ),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            CheckConstraint(
                condition=~Q(supplier_name=""),
                name="chk_po_supplier_name_nonempty",
            ),
            CheckConstraint(
                condition=Q(currency=OrderCurrency.MXN),
                name="chk_po_currency_mxn",
            ),
            CheckConstraint(
                condition=Q(
                    status__in=[
                        OrderStatus.DRAFT,
                        OrderStatus.SUBMITTED,
                        OrderStatus.CANCELLED,
                    ]
                ),
                name="chk_po_status_valid",
            ),
            CheckConstraint(
                condition=Q(total_amount__gt=Decimal("0.00")),
                name="chk_po_total_amount_gt_zero",
            ),
            CheckConstraint(
                condition=Q(version__gte=1),
                name="chk_po_version_gte_one",
            ),
            CheckConstraint(
                condition=(
                    Q(
                        status=OrderStatus.DRAFT,
                        submitted_at__isnull=True,
                        cancelled_at__isnull=True,
                    )
                    | Q(
                        status=OrderStatus.SUBMITTED,
                        submitted_at__isnull=False,
                        cancelled_at__isnull=True,
                    )
                    | Q(
                        status=OrderStatus.CANCELLED,
                        cancelled_at__isnull=False,
                    )
                ),
                name="chk_po_status_timestamps",
            ),
        ]

    def __str__(self) -> str:
        return f"PurchaseOrder({self.id}, status={self.status}, v={self.version})"
