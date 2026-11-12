import uuid
from decimal import Decimal
from typing import ClassVar

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies: ClassVar[list[tuple[str, str]]] = []

    operations: ClassVar[list[migrations.operations.base.Operation]] = [
        migrations.CreateModel(
            name="PurchaseOrder",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("requester_id", models.UUIDField()),
                ("supplier_name", models.CharField(max_length=200)),
                (
                    "currency",
                    models.CharField(
                        choices=[("MXN", "MXN")],
                        default="MXN",
                        max_length=3,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "DRAFT"),
                            ("SUBMITTED", "SUBMITTED"),
                            ("CANCELLED", "CANCELLED"),
                        ],
                        default="DRAFT",
                        max_length=16,
                    ),
                ),
                ("total_amount", models.DecimalField(decimal_places=2, max_digits=18)),
                ("version", models.BigIntegerField(default=1)),
                ("last_modified_by", models.UUIDField()),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                ("cancelled_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "db_table": "purchase_orders",
                "indexes": [
                    models.Index(
                        fields=["requester_id", "-created_at", "id"],
                        name="idx_po_requester_created_id",
                    ),
                    models.Index(
                        fields=["status", "-created_at", "id"],
                        name="idx_po_status_created_id",
                    ),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("supplier_name", ""), _negated=True),
                        name="chk_po_supplier_name_nonempty",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("currency", "MXN")),
                        name="chk_po_currency_mxn",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("status__in", ["DRAFT", "SUBMITTED", "CANCELLED"])),
                        name="chk_po_status_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("total_amount__gt", Decimal("0.00"))),
                        name="chk_po_total_amount_gt_zero",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("version__gte", 1)),
                        name="chk_po_version_gte_one",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            models.Q(
                                ("cancelled_at__isnull", True),
                                ("status", "DRAFT"),
                                ("submitted_at__isnull", True),
                            ),
                            models.Q(
                                ("cancelled_at__isnull", True),
                                ("status", "SUBMITTED"),
                                ("submitted_at__isnull", False),
                            ),
                            models.Q(
                                ("cancelled_at__isnull", False),
                                ("status", "CANCELLED"),
                            ),
                            _connector="OR",
                        ),
                        name="chk_po_status_timestamps",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="PurchaseOrderLine",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("position", models.SmallIntegerField()),
                ("product_id", models.UUIDField()),
                ("sku_snapshot", models.CharField(max_length=64)),
                ("name_snapshot", models.CharField(max_length=200)),
                (
                    "unit",
                    models.CharField(
                        choices=[("UNIT", "UNIT")],
                        default="UNIT",
                        max_length=16,
                    ),
                ),
                ("quantity", models.IntegerField()),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=18)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=18)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "order",
                    models.ForeignKey(
                        db_column="order_id",
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="lines",
                        to="orders.purchaseorder",
                    ),
                ),
            ],
            options={
                "db_table": "purchase_order_lines",
                "constraints": [
                    models.UniqueConstraint(
                        fields=("order", "position"),
                        name="uq_pol_order_position",
                    ),
                    models.UniqueConstraint(
                        fields=("order", "product_id"),
                        name="uq_pol_order_product",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("position__gte", 1), ("position__lte", 100)),
                        name="chk_pol_position_range",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("sku_snapshot", ""), _negated=True),
                        name="chk_pol_sku_nonempty",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("name_snapshot", ""), _negated=True),
                        name="chk_pol_name_nonempty",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("unit", "UNIT")),
                        name="chk_pol_unit_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("quantity__gt", 0)),
                        name="chk_pol_quantity_gt_zero",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("unit_price__gt", Decimal("0.00"))),
                        name="chk_pol_unit_price_gt_zero",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("line_total__gt", Decimal("0.00"))),
                        name="chk_pol_line_total_gt_zero",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="IdempotencyKey",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("requester_id", models.UUIDField()),
                ("idempotency_key", models.UUIDField()),
                (
                    "operation",
                    models.CharField(
                        choices=[
                            ("CREATE_ORDER", "CREATE_ORDER"),
                            ("SUBMIT_ORDER", "SUBMIT_ORDER"),
                            ("CANCEL_ORDER", "CANCEL_ORDER"),
                        ],
                        max_length=24,
                    ),
                ),
                ("request_hash", models.CharField(max_length=64)),
                ("response_status", models.SmallIntegerField()),
                ("response_body", models.JSONField()),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "order",
                    models.ForeignKey(
                        db_column="order_id",
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="idempotency_keys",
                        to="orders.purchaseorder",
                    ),
                ),
            ],
            options={
                "db_table": "idempotency_keys",
                "indexes": [
                    models.Index(
                        fields=["order", "created_at"],
                        name="idx_idem_order_created",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("requester_id", "idempotency_key"),
                        name="uq_idem_requester_key",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            (
                                "operation__in",
                                ["CREATE_ORDER", "SUBMIT_ORDER", "CANCEL_ORDER"],
                            )
                        ),
                        name="chk_idem_operation_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            ("response_status__gte", 100),
                            ("response_status__lte", 599),
                        ),
                        name="chk_idem_status_range",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="PurchaseOrderHistory",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("order_version", models.BigIntegerField()),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("CREATED", "CREATED"),
                            ("UPDATED", "UPDATED"),
                            ("SUBMITTED", "SUBMITTED"),
                            ("CANCELLED", "CANCELLED"),
                        ],
                        max_length=24,
                    ),
                ),
                (
                    "from_status",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("DRAFT", "DRAFT"),
                            ("SUBMITTED", "SUBMITTED"),
                            ("CANCELLED", "CANCELLED"),
                        ],
                        max_length=16,
                        null=True,
                    ),
                ),
                (
                    "to_status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "DRAFT"),
                            ("SUBMITTED", "SUBMITTED"),
                            ("CANCELLED", "CANCELLED"),
                        ],
                        max_length=16,
                    ),
                ),
                ("actor_user_id", models.UUIDField()),
                ("request_id", models.UUIDField()),
                ("changes", models.JSONField()),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "order",
                    models.ForeignKey(
                        db_column="order_id",
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="history_entries",
                        to="orders.purchaseorder",
                    ),
                ),
            ],
            options={
                "db_table": "purchase_order_history",
                "indexes": [
                    models.Index(
                        fields=["order", "created_at"],
                        name="idx_poh_order_created",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("order", "order_version"),
                        name="uq_poh_order_version",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("order_version__gte", 1)),
                        name="chk_poh_version_gte_one",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            (
                                "action__in",
                                ["CREATED", "UPDATED", "SUBMITTED", "CANCELLED"],
                            )
                        ),
                        name="chk_poh_action_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            ("from_status__isnull", True),
                            ("from_status__in", ["DRAFT", "SUBMITTED", "CANCELLED"]),
                            _connector="OR",
                        ),
                        name="chk_poh_from_status_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("to_status__in", ["DRAFT", "SUBMITTED", "CANCELLED"])),
                        name="chk_poh_to_status_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            models.Q(
                                ("action", "CREATED"),
                                ("from_status__isnull", True),
                            ),
                            models.Q(
                                models.Q(("action", "CREATED"), _negated=True),
                                ("from_status__isnull", False),
                            ),
                            _connector="OR",
                        ),
                        name="chk_poh_created_from_status",
                    ),
                ],
            },
        ),
    ]
