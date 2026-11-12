from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Index, Q
from django.utils import timezone

from projections.models.choices import ProjectionProductUnit


class ProductProjection(models.Model):
    product_id = models.UUIDField(primary_key=True, editable=False)
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=200)
    unit = models.CharField(
        max_length=16,
        choices=ProjectionProductUnit.choices,
        default=ProjectionProductUnit.UNIT,
    )
    stock_on_hand = models.BigIntegerField()
    active = models.BooleanField()
    created_by = models.UUIDField()
    updated_by = models.UUIDField()
    entity_version = models.BigIntegerField()
    source_event_id = models.UUIDField()
    source_event_at = models.DateTimeField()
    projected_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "product_projections"
        indexes: ClassVar[list[Index]] = [
            Index(fields=["sku"], name="idx_prod_proj_sku"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            CheckConstraint(
                condition=Q(unit=ProjectionProductUnit.UNIT),
                name="chk_prod_proj_unit_valid",
            ),
            CheckConstraint(
                condition=Q(stock_on_hand__gte=0),
                name="chk_prod_proj_stock_nonneg",
            ),
            CheckConstraint(
                condition=Q(entity_version__gte=1),
                name="chk_prod_proj_version_gte_one",
            ),
            CheckConstraint(
                condition=~Q(sku=""),
                name="chk_prod_proj_sku_nonempty",
            ),
            CheckConstraint(
                condition=~Q(name=""),
                name="chk_prod_proj_name_nonempty",
            ),
        ]

    def __str__(self) -> str:
        return f"ProductProjection({self.product_id}, sku={self.sku}, v={self.entity_version})"
