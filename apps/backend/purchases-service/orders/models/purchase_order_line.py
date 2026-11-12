import uuid
from decimal import Decimal
from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Q, UniqueConstraint
from django.utils import timezone

from orders.models.choices import ProductUnit
from orders.models.purchase_order import PurchaseOrder


class PurchaseOrderLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.RESTRICT,
        related_name="lines",
        db_column="order_id",
    )
    position = models.SmallIntegerField()
    product_id = models.UUIDField()
    sku_snapshot = models.CharField(max_length=64)
    name_snapshot = models.CharField(max_length=200)
    unit = models.CharField(
        max_length=16,
        choices=ProductUnit.choices,
        default=ProductUnit.UNIT,
    )
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "purchase_order_lines"
        constraints: ClassVar[list[models.BaseConstraint]] = [
            UniqueConstraint(
                fields=["order", "position"],
                name="uq_pol_order_position",
            ),
            UniqueConstraint(
                fields=["order", "product_id"],
                name="uq_pol_order_product",
            ),
            CheckConstraint(
                condition=Q(position__gte=1, position__lte=100),
                name="chk_pol_position_range",
            ),
            CheckConstraint(
                condition=~Q(sku_snapshot=""),
                name="chk_pol_sku_nonempty",
            ),
            CheckConstraint(
                condition=~Q(name_snapshot=""),
                name="chk_pol_name_nonempty",
            ),
            CheckConstraint(
                condition=Q(unit=ProductUnit.UNIT),
                name="chk_pol_unit_valid",
            ),
            CheckConstraint(
                condition=Q(quantity__gt=0),
                name="chk_pol_quantity_gt_zero",
            ),
            CheckConstraint(
                condition=Q(unit_price__gt=Decimal("0.00")),
                name="chk_pol_unit_price_gt_zero",
            ),
            CheckConstraint(
                condition=Q(line_total__gt=Decimal("0.00")),
                name="chk_pol_line_total_gt_zero",
            ),
        ]

    def __str__(self) -> str:
        return f"PurchaseOrderLine({self.id}, order={self.order_id}, pos={self.position})"
