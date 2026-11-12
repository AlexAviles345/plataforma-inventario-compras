import uuid
from datetime import UTC, datetime
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models.deletion import RestrictedError
from django.test import TestCase

from orders.models import (
    IdempotencyKey,
    IdempotencyOperation,
    OrderCurrency,
    OrderHistoryAction,
    OrderStatus,
    ProductUnit,
    PurchaseOrder,
    PurchaseOrderHistory,
    PurchaseOrderLine,
)


class PurchaseOrderDomainModelTests(TestCase):
    def setUp(self):
        self.requester_id = uuid.uuid4()
        self.actor_id = self.requester_id
        self.product_id = uuid.uuid4()
        self.now = datetime(2026, 11, 11, 18, 0, 0, tzinfo=UTC)

    def _create_draft_order(self, **overrides) -> PurchaseOrder:
        defaults = {
            "requester_id": self.requester_id,
            "supplier_name": "Proveedor Tecnológico S.A.",
            "currency": OrderCurrency.MXN,
            "status": OrderStatus.DRAFT,
            "total_amount": Decimal("2500.50"),
            "version": 1,
            "last_modified_by": self.actor_id,
            "created_at": self.now,
            "updated_at": self.now,
        }
        defaults.update(overrides)
        return PurchaseOrder.objects.create(**defaults)

    def test_create_order_lines_idempotency_and_history_transactional_integrity(self):
        order = self._create_draft_order()
        line = PurchaseOrderLine.objects.create(
            order=order,
            position=1,
            product_id=self.product_id,
            sku_snapshot="LAP-001",
            name_snapshot="Laptop Empresarial",
            unit=ProductUnit.UNIT,
            quantity=2,
            unit_price=Decimal("1250.25"),
            line_total=Decimal("2500.50"),
        )
        idem = IdempotencyKey.objects.create(
            requester_id=self.requester_id,
            idempotency_key=uuid.uuid4(),
            operation=IdempotencyOperation.CREATE_ORDER,
            order=order,
            request_hash="a" * 64,
            response_status=201,
            response_body={"error": False, "statusCode": 201, "data": {"id": str(order.id)}},
        )
        history = PurchaseOrderHistory.objects.create(
            order=order,
            order_version=1,
            action=OrderHistoryAction.CREATED,
            from_status=None,
            to_status=OrderStatus.DRAFT,
            actor_user_id=self.actor_id,
            request_id=uuid.uuid4(),
            changes={"supplierName": order.supplier_name, "lineCount": 1},
        )

        self.assertEqual(order.lines.count(), 1)
        self.assertEqual(line.line_total, Decimal("2500.50"))
        self.assertEqual(idem.order_id, order.id)
        self.assertEqual(history.order_version, 1)

        with self.assertRaises(RestrictedError):
            order.delete()

    def test_order_status_timestamp_constraints(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._create_draft_order(submitted_at=self.now)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self._create_draft_order(status=OrderStatus.SUBMITTED, submitted_at=None)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self._create_draft_order(status=OrderStatus.CANCELLED, cancelled_at=None)

        submitted_then_cancelled = self._create_draft_order(
            status=OrderStatus.CANCELLED,
            submitted_at=self.now,
            cancelled_at=self.now,
        )
        self.assertEqual(submitted_then_cancelled.status, OrderStatus.CANCELLED)

    def test_order_line_uniqueness_and_range_constraints(self):
        order = self._create_draft_order()
        PurchaseOrderLine.objects.create(
            order=order,
            position=1,
            product_id=self.product_id,
            sku_snapshot="LAP-001",
            name_snapshot="Laptop",
            unit=ProductUnit.UNIT,
            quantity=1,
            unit_price=Decimal("100.00"),
            line_total=Decimal("100.00"),
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseOrderLine.objects.create(
                order=order,
                position=2,
                product_id=self.product_id,
                sku_snapshot="LAP-001",
                name_snapshot="Laptop",
                unit=ProductUnit.UNIT,
                quantity=1,
                unit_price=Decimal("100.00"),
                line_total=Decimal("100.00"),
            )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseOrderLine.objects.create(
                order=order,
                position=101,
                product_id=uuid.uuid4(),
                sku_snapshot="MON-002",
                name_snapshot="Monitor",
                unit=ProductUnit.UNIT,
                quantity=1,
                unit_price=Decimal("100.00"),
                line_total=Decimal("100.00"),
            )

    def test_idempotency_and_history_uniqueness_constraints(self):
        order = self._create_draft_order()
        shared_key = uuid.uuid4()

        IdempotencyKey.objects.create(
            requester_id=self.requester_id,
            idempotency_key=shared_key,
            operation=IdempotencyOperation.CREATE_ORDER,
            order=order,
            request_hash="b" * 64,
            response_status=201,
            response_body={"error": False},
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            IdempotencyKey.objects.create(
                requester_id=self.requester_id,
                idempotency_key=shared_key,
                operation=IdempotencyOperation.SUBMIT_ORDER,
                order=order,
                request_hash="c" * 64,
                response_status=200,
                response_body={"error": False},
            )

        PurchaseOrderHistory.objects.create(
            order=order,
            order_version=1,
            action=OrderHistoryAction.CREATED,
            from_status=None,
            to_status=OrderStatus.DRAFT,
            actor_user_id=self.actor_id,
            request_id=uuid.uuid4(),
            changes={},
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseOrderHistory.objects.create(
                order=order,
                order_version=1,
                action=OrderHistoryAction.UPDATED,
                from_status=OrderStatus.DRAFT,
                to_status=OrderStatus.DRAFT,
                actor_user_id=self.actor_id,
                request_id=uuid.uuid4(),
                changes={},
            )
