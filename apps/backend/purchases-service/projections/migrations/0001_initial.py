from typing import ClassVar

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies: ClassVar[list[tuple[str, str]]] = [
        ("orders", "0001_initial"),
    ]

    operations: ClassVar[list[migrations.operations.base.Operation]] = [
        migrations.CreateModel(
            name="UserProjection",
            fields=[
                (
                    "user_id",
                    models.UUIDField(editable=False, primary_key=True, serialize=False),
                ),
                ("email", models.CharField(max_length=254)),
                ("display_name", models.CharField(max_length=200)),
                ("active", models.BooleanField()),
                ("assignments", models.JSONField()),
                ("entity_version", models.BigIntegerField()),
                ("source_event_id", models.UUIDField()),
                ("source_event_at", models.DateTimeField()),
                ("projected_at", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "db_table": "user_projections",
                "indexes": [
                    models.Index(fields=["email"], name="idx_user_proj_email"),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("entity_version__gte", 1)),
                        name="chk_user_proj_version_gte_one",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("email", ""), _negated=True),
                        name="chk_user_proj_email_nonempty",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("display_name", ""), _negated=True),
                        name="chk_user_proj_name_nonempty",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="ProductProjection",
            fields=[
                (
                    "product_id",
                    models.UUIDField(editable=False, primary_key=True, serialize=False),
                ),
                ("sku", models.CharField(max_length=64)),
                ("name", models.CharField(max_length=200)),
                (
                    "unit",
                    models.CharField(
                        choices=[("UNIT", "UNIT")],
                        default="UNIT",
                        max_length=16,
                    ),
                ),
                ("stock_on_hand", models.BigIntegerField()),
                ("active", models.BooleanField()),
                ("created_by", models.UUIDField()),
                ("updated_by", models.UUIDField()),
                ("entity_version", models.BigIntegerField()),
                ("source_event_id", models.UUIDField()),
                ("source_event_at", models.DateTimeField()),
                ("projected_at", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "db_table": "product_projections",
                "indexes": [
                    models.Index(fields=["sku"], name="idx_prod_proj_sku"),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(("unit", "UNIT")),
                        name="chk_prod_proj_unit_valid",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("stock_on_hand__gte", 0)),
                        name="chk_prod_proj_stock_nonneg",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("entity_version__gte", 1)),
                        name="chk_prod_proj_version_gte_one",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("sku", ""), _negated=True),
                        name="chk_prod_proj_sku_nonempty",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("name", ""), _negated=True),
                        name="chk_prod_proj_name_nonempty",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="InboxEvent",
            fields=[
                (
                    "event_id",
                    models.UUIDField(editable=False, primary_key=True, serialize=False),
                ),
                ("consumer_group", models.CharField(max_length=128)),
                ("topic", models.CharField(max_length=255)),
                ("partition_number", models.IntegerField()),
                ("offset_value", models.BigIntegerField()),
                ("aggregate_id", models.UUIDField()),
                ("event_type", models.CharField(max_length=64)),
                ("schema_version", models.SmallIntegerField()),
                ("entity_version", models.BigIntegerField()),
                ("correlation_id", models.UUIDField()),
                ("event_occurred_at", models.DateTimeField()),
                ("payload_hash", models.CharField(max_length=64)),
                (
                    "outcome",
                    models.CharField(
                        choices=[
                            ("APPLIED", "APPLIED"),
                            ("IGNORED_STALE", "IGNORED_STALE"),
                        ],
                        max_length=24,
                    ),
                ),
                ("processed_at", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "db_table": "inbox_events",
                "constraints": [
                    models.UniqueConstraint(
                        fields=(
                            "consumer_group",
                            "topic",
                            "partition_number",
                            "offset_value",
                        ),
                        name="uq_inbox_group_topic_part_off",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("partition_number__gte", 0)),
                        name="chk_inbox_partition_nonneg",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("offset_value__gte", 0)),
                        name="chk_inbox_offset_nonneg",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("schema_version__gte", 1)),
                        name="chk_inbox_schema_ver_gte_one",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("entity_version__gte", 1)),
                        name="chk_inbox_entity_ver_gte_one",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("outcome__in", ["APPLIED", "IGNORED_STALE"])),
                        name="chk_inbox_outcome_valid",
                    ),
                ],
            },
        ),
    ]
