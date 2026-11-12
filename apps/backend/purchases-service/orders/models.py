import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Index, Q, UniqueConstraint
from django.utils import timezone


class OrderCurrency(models.TextChoices):
    MXN = "MXN", "MXN"


class OrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "DRAFT"
    SUBMITTED = "SUBMITTED", "SUBMITTED"
    CANCELLED = "CANCELLED", "CANCELLED"


class ProductUnit(models.TextChoices):
    UNIT = "UNIT", "UNIT"


class IdempotencyOperation(models.TextChoices):
    CREATE_ORDER = "CREATE_ORDER", "CREATE_ORDER"
    SUBMIT_ORDER = "SUBMIT_ORDER", "SUBMIT_ORDER"
    CANCEL_ORDER = "CANCEL_ORDER", "CANCEL_ORDER"


class OrderHistoryAction(models.TextChoices):
    CREATED = "CREATED", "CREATED"
    UPDATED = "UPDATED", "UPDATED"
    SUBMITTED = "SUBMITTED", "SUBMITTED"
    CANCELLED = "CANCELLED", "CANCELLED"


class InboxOutcome(models.TextChoices):
    APPLIED = "APPLIED", "APPLIED"
    IGNORED_STALE = "IGNORED_STALE", "IGNORED_STALE"


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


class UserProjection(models.Model):
    user_id = models.UUIDField(primary_key=True, editable=False)
    email = models.CharField(max_length=254)
    display_name = models.CharField(max_length=200)
    active = models.BooleanField()
    assignments = models.JSONField()
    entity_version = models.BigIntegerField()
    source_event_id = models.UUIDField()
    source_event_at = models.DateTimeField()
    projected_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "user_projections"
        indexes: ClassVar[list[Index]] = [
            Index(fields=["email"], name="idx_user_proj_email"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            CheckConstraint(
                condition=Q(entity_version__gte=1),
                name="chk_user_proj_version_gte_one",
            ),
            CheckConstraint(
                condition=~Q(email=""),
                name="chk_user_proj_email_nonempty",
            ),
            CheckConstraint(
                condition=~Q(display_name=""),
                name="chk_user_proj_name_nonempty",
            ),
        ]

    def __str__(self) -> str:
        return f"UserProjection({self.user_id}, email={self.email}, v={self.entity_version})"


class ProductProjection(models.Model):
    product_id = models.UUIDField(primary_key=True, editable=False)
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=200)
    unit = models.CharField(
        max_length=16,
        choices=ProductUnit.choices,
        default=ProductUnit.UNIT,
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
                condition=Q(unit=ProductUnit.UNIT),
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


__all__ = [
    "UTC",
    "IdempotencyKey",
    "IdempotencyOperation",
    "InboxEvent",
    "InboxOutcome",
    "OrderCurrency",
    "OrderHistoryAction",
    "OrderStatus",
    "ProductProjection",
    "ProductUnit",
    "PurchaseOrder",
    "PurchaseOrderHistory",
    "PurchaseOrderLine",
    "UserProjection",
    "datetime",
]
