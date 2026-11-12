import uuid
from datetime import UTC, datetime

from django.db import IntegrityError, transaction
from django.test import TestCase

from projections.models import (
    InboxEvent,
    InboxOutcome,
    ProductProjection,
    ProjectionProductUnit,
    UserProjection,
)


class ProjectionsDataModelTests(TestCase):
    def setUp(self):
        self.user_id = uuid.uuid4()
        self.product_id = uuid.uuid4()
        self.now = datetime(2026, 11, 11, 18, 0, 0, tzinfo=UTC)

    def test_user_and_product_projections_constraints(self):
        user_proj = UserProjection.objects.create(
            user_id=self.user_id,
            email="compras@techdistribution.com",
            display_name="Agente Compras",
            active=True,
            assignments=[{"system": "PURCHASES", "role": "PURCHASES_AGENT"}],
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )
        prod_proj = ProductProjection.objects.create(
            product_id=self.product_id,
            sku="LAP-001",
            name="Laptop Empresarial",
            unit=ProjectionProductUnit.UNIT,
            stock_on_hand=15,
            active=True,
            created_by=uuid.uuid4(),
            updated_by=uuid.uuid4(),
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )

        self.assertTrue(user_proj.active)
        self.assertEqual(prod_proj.stock_on_hand, 15)

        with self.assertRaises(IntegrityError), transaction.atomic():
            ProductProjection.objects.create(
                product_id=uuid.uuid4(),
                sku="LAP-002",
                name="Laptop Stock Inválido",
                unit=ProjectionProductUnit.UNIT,
                stock_on_hand=-1,
                active=True,
                created_by=uuid.uuid4(),
                updated_by=uuid.uuid4(),
                entity_version=1,
                source_event_id=uuid.uuid4(),
                source_event_at=self.now,
                projected_at=self.now,
            )

    def test_inbox_event_deduplication_and_check_constraints(self):
        inbox = InboxEvent.objects.create(
            event_id=uuid.uuid4(),
            consumer_group="purchases.inventory-products.v1",
            topic="inventory.products.events",
            partition_number=0,
            offset_value=42,
            aggregate_id=self.product_id,
            event_type="ProductCreated",
            schema_version=1,
            entity_version=1,
            correlation_id=uuid.uuid4(),
            event_occurred_at=self.now,
            payload_hash="d" * 64,
            outcome=InboxOutcome.APPLIED,
            processed_at=self.now,
        )
        self.assertEqual(inbox.outcome, InboxOutcome.APPLIED)

        with self.assertRaises(IntegrityError), transaction.atomic():
            InboxEvent.objects.create(
                event_id=uuid.uuid4(),
                consumer_group="purchases.inventory-products.v1",
                topic="inventory.products.events",
                partition_number=0,
                offset_value=42,
                aggregate_id=self.product_id,
                event_type="ProductUpdated",
                schema_version=1,
                entity_version=2,
                correlation_id=uuid.uuid4(),
                event_occurred_at=self.now,
                payload_hash="e" * 64,
                outcome=InboxOutcome.IGNORED_STALE,
                processed_at=self.now,
            )
