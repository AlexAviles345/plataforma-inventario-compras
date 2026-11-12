import json
import tempfile
import uuid
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase

from projections.consumers import (
    PRODUCTS_CONSUMER_SPEC,
    TRANSIENT_RETRY_DELAYS_SECONDS,
    USERS_CONSUMER_SPEC,
    DlqDeliveryError,
    KafkaRecord,
    ProjectionConsumerWorker,
)
from projections.models import (
    InboxEvent,
    InboxOutcome,
    ProductProjection,
    ProjectionProductUnit,
    UserProjection,
)
from projections.services import (
    PermanentEventValidationError,
    import_projection_snapshot,
    ingest_domain_event,
    parse_and_validate_event,
)


def _build_user_event(
    *,
    event_id: uuid.UUID | None = None,
    event_type: str = "UserCreated",
    user_id: uuid.UUID | None = None,
    entity_version: int = 1,
    email: str = "agente@techdistribution.com",
    display_name: str = "Agente Compras",
    active: bool = True,
    assignments: list[dict[str, str]] | None = None,
) -> dict:
    uid = str(user_id or uuid.uuid4())
    return {
        "eventId": str(event_id or uuid.uuid4()),
        "eventType": event_type,
        "schemaVersion": 1,
        "aggregateId": uid,
        "entityVersion": entity_version,
        "timestamp": "2026-11-11T18:00:00Z",
        "correlationId": str(uuid.uuid4()),
        "data": {
            "userId": uid,
            "email": email,
            "displayName": display_name,
            "active": active,
            "assignments": assignments
            if assignments is not None
            else [{"system": "PURCHASES", "role": "PURCHASES_AGENT"}],
        },
    }


def _build_product_event(
    *,
    event_id: uuid.UUID | None = None,
    event_type: str = "ProductCreated",
    product_id: uuid.UUID | None = None,
    entity_version: int = 1,
    sku: str = "LAP-001",
    name: str = "Laptop Empresarial",
    stock_on_hand: int = 25,
    active: bool = True,
    created_by: uuid.UUID | None = None,
    updated_by: uuid.UUID | None = None,
) -> dict:
    pid = str(product_id or uuid.uuid4())
    actor = str(created_by or uuid.uuid4())
    upd_actor = str(updated_by or actor)
    return {
        "eventId": str(event_id or uuid.uuid4()),
        "eventType": event_type,
        "schemaVersion": 1,
        "aggregateId": pid,
        "entityVersion": entity_version,
        "timestamp": "2026-11-11T18:05:00Z",
        "correlationId": str(uuid.uuid4()),
        "data": {
            "productId": pid,
            "sku": sku,
            "name": name,
            "unit": "UNIT",
            "stockOnHand": stock_on_hand,
            "active": active,
            "createdBy": actor,
            "updatedBy": upd_actor,
        },
    }


class FakePartitionController:
    def __init__(self) -> None:
        self.paused: list[tuple[str, int]] = []
        self.resumed: list[tuple[str, int]] = []
        self.committed: list[tuple[str, int, int]] = []

    def pause_partition(self, topic: str, partition: int) -> None:
        self.paused.append((topic, partition))

    def resume_partition(self, topic: str, partition: int) -> None:
        self.resumed.append((topic, partition))

    def commit_offset(self, topic: str, partition: int, next_offset: int) -> None:
        self.committed.append((topic, partition, next_offset))


class FakeDlqPublisher:
    def __init__(self, *, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.published: list[tuple[str, dict]] = []

    def publish(self, dlq_topic: str, envelope: dict) -> None:
        if self.should_fail:
            raise DlqDeliveryError("Broker DLQ no disponible")
        self.published.append((dlq_topic, envelope))


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


class EventSchemaValidationTests(TestCase):
    def test_valid_user_and_product_events_pass_validation(self):
        user_payload = _build_user_event()
        validated_user = parse_and_validate_event(
            user_payload,
            expected_domain="user",
            partition_key=user_payload["aggregateId"],
        )
        self.assertEqual(validated_user.event_type, "UserCreated")
        self.assertEqual(validated_user.entity_version, 1)

        product_payload = _build_product_event()
        validated_prod = parse_and_validate_event(
            product_payload,
            expected_domain="product",
            partition_key=product_payload["aggregateId"].encode("utf-8"),
        )
        self.assertEqual(validated_prod.event_type, "ProductCreated")
        self.assertEqual(validated_prod.data["sku"], "LAP-001")

    def test_rejects_additional_properties_mismatched_ids_and_duplicate_systems(self):
        bad_extra = _build_user_event()
        bad_extra["unexpectedField"] = "nope"
        with self.assertRaises(PermanentEventValidationError):
            parse_and_validate_event(bad_extra, expected_domain="user")

        mismatch_id = _build_product_event()
        mismatch_id["data"]["productId"] = str(uuid.uuid4())
        with self.assertRaises(PermanentEventValidationError):
            parse_and_validate_event(mismatch_id, expected_domain="product")

        mismatch_key = _build_user_event()
        with self.assertRaises(PermanentEventValidationError):
            parse_and_validate_event(
                mismatch_key,
                expected_domain="user",
                partition_key=str(uuid.uuid4()),
            )

        dup_assignments = _build_user_event(
            assignments=[
                {"system": "PURCHASES", "role": "ADMIN"},
                {"system": "PURCHASES", "role": "PURCHASES_AGENT"},
            ]
        )
        with self.assertRaises(PermanentEventValidationError):
            parse_and_validate_event(dup_assignments, expected_domain="user")


class ProjectionIngestionServiceTests(TestCase):
    def test_user_ingestion_monotonic_versions_deactivation_and_deduplication(self):
        user_id = uuid.uuid4()
        created_evt = _build_user_event(user_id=user_id, entity_version=1)

        res1 = ingest_domain_event(
            raw_payload=created_evt,
            expected_domain="user",
            consumer_group=USERS_CONSUMER_SPEC.consumer_group,
            topic=USERS_CONSUMER_SPEC.topic,
            partition_number=0,
            offset_value=10,
            partition_key=str(user_id),
        )
        self.assertEqual(res1.outcome, InboxOutcome.APPLIED)
        self.assertFalse(res1.duplicate)

        # Duplicado por mismo eventId
        res_dup = ingest_domain_event(
            raw_payload=created_evt,
            expected_domain="user",
            consumer_group=USERS_CONSUMER_SPEC.consumer_group,
            topic=USERS_CONSUMER_SPEC.topic,
            partition_number=0,
            offset_value=11,
            partition_key=str(user_id),
        )
        self.assertTrue(res_dup.duplicate)
        self.assertEqual(InboxEvent.objects.count(), 1)

        # Actualización versión 3 (desactiva usuario, conserva fila)
        updated_v3 = _build_user_event(
            user_id=user_id,
            event_type="UserUpdated",
            entity_version=3,
            active=False,
            assignments=[],
        )
        res_v3 = ingest_domain_event(
            raw_payload=updated_v3,
            expected_domain="user",
            consumer_group=USERS_CONSUMER_SPEC.consumer_group,
            topic=USERS_CONSUMER_SPEC.topic,
            partition_number=0,
            offset_value=12,
            partition_key=str(user_id),
        )
        self.assertEqual(res_v3.outcome, InboxOutcome.APPLIED)
        user_proj = UserProjection.objects.get(user_id=user_id)
        self.assertFalse(user_proj.active)
        self.assertEqual(user_proj.entity_version, 3)

        # Evento obsoleto versión 2 -> IGNORED_STALE sin sobrescribir versión 3
        stale_v2 = _build_user_event(
            user_id=user_id,
            event_type="UserUpdated",
            entity_version=2,
            active=True,
            display_name="Nombre Antiguo",
        )
        res_v2 = ingest_domain_event(
            raw_payload=stale_v2,
            expected_domain="user",
            consumer_group=USERS_CONSUMER_SPEC.consumer_group,
            topic=USERS_CONSUMER_SPEC.topic,
            partition_number=0,
            offset_value=13,
            partition_key=str(user_id),
        )
        self.assertEqual(res_v2.outcome, InboxOutcome.IGNORED_STALE)
        self.assertFalse(res_v2.duplicate)
        user_proj.refresh_from_db()
        self.assertEqual(user_proj.entity_version, 3)
        self.assertFalse(user_proj.active)

    def test_product_updated_creates_missing_projection_and_ignores_older_created(self):
        product_id = uuid.uuid4()
        updated_first = _build_product_event(
            product_id=product_id,
            event_type="ProductUpdated",
            entity_version=2,
            sku="MON-4K",
            name="Monitor 4K Pro",
            stock_on_hand=8,
        )
        res_upd = ingest_domain_event(
            raw_payload=updated_first,
            expected_domain="product",
            consumer_group=PRODUCTS_CONSUMER_SPEC.consumer_group,
            topic=PRODUCTS_CONSUMER_SPEC.topic,
            partition_number=1,
            offset_value=1,
            partition_key=str(product_id),
        )
        self.assertEqual(res_upd.outcome, InboxOutcome.APPLIED)
        prod_proj = ProductProjection.objects.get(product_id=product_id)
        self.assertEqual(prod_proj.entity_version, 2)
        self.assertEqual(prod_proj.name, "Monitor 4K Pro")

        older_created = _build_product_event(
            product_id=product_id,
            event_type="ProductCreated",
            entity_version=1,
            sku="MON-OLD",
            name="Monitor Viejo",
            stock_on_hand=2,
        )
        res_old = ingest_domain_event(
            raw_payload=older_created,
            expected_domain="product",
            consumer_group=PRODUCTS_CONSUMER_SPEC.consumer_group,
            topic=PRODUCTS_CONSUMER_SPEC.topic,
            partition_number=1,
            offset_value=2,
            partition_key=str(product_id),
        )
        self.assertEqual(res_old.outcome, InboxOutcome.IGNORED_STALE)
        prod_proj.refresh_from_db()
        self.assertEqual(prod_proj.entity_version, 2)
        self.assertEqual(prod_proj.name, "Monitor 4K Pro")


class ProjectionConsumerWorkerTests(TestCase):
    def test_permanent_validation_error_goes_directly_to_dlq_without_retries(self):
        controller = FakePartitionController()
        dlq = FakeDlqPublisher()
        slept: list[float] = []
        worker = ProjectionConsumerWorker(
            spec=USERS_CONSUMER_SPEC,
            controller=controller,
            dlq_publisher=dlq,
            sleep_fn=slept.append,
            jitter_fn=lambda: 0.0,
        )

        record = KafkaRecord(
            topic=USERS_CONSUMER_SPEC.topic,
            partition=0,
            offset=50,
            key="invalid-key",
            value=b'{"malformed": true}',
        )
        report = worker.process_record(record)

        self.assertEqual(report.status, "ISOLATED_DLQ")
        self.assertEqual(report.attempts, 1)
        self.assertEqual(slept, [])
        self.assertEqual(len(dlq.published), 1)
        self.assertEqual(dlq.published[0][0], USERS_CONSUMER_SPEC.dlq_topic)
        self.assertEqual(controller.committed, [(USERS_CONSUMER_SPEC.topic, 0, 51)])

    def test_transient_error_retries_with_backoff_and_commits_on_recovery(self):
        controller = FakePartitionController()
        dlq = FakeDlqPublisher()
        slept: list[float] = []
        call_count = 0

        def flaky_ingestor(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise DatabaseError("Conexión temporalmente caída")
            return ingest_domain_event(**kwargs)

        worker = ProjectionConsumerWorker(
            spec=PRODUCTS_CONSUMER_SPEC,
            controller=controller,
            dlq_publisher=dlq,
            sleep_fn=slept.append,
            jitter_fn=lambda: 0.0,
            ingestor_fn=flaky_ingestor,
        )

        prod_evt = _build_product_event()
        record = KafkaRecord(
            topic=PRODUCTS_CONSUMER_SPEC.topic,
            partition=2,
            offset=99,
            key=prod_evt["aggregateId"],
            value=json.dumps(prod_evt).encode("utf-8"),
        )
        report = worker.process_record(record)

        self.assertEqual(report.status, "COMMITTED_AFTER_RETRY")
        self.assertEqual(report.attempts, 3)
        self.assertEqual(slept, [1.0, 2.0])
        self.assertEqual(len(controller.paused), 2)
        self.assertEqual(len(controller.resumed), 2)
        self.assertEqual(len(dlq.published), 0)
        self.assertEqual(controller.committed, [(PRODUCTS_CONSUMER_SPEC.topic, 2, 100)])

    def test_transient_error_exhausts_5_retries_and_isolates_to_dlq(self):
        controller = FakePartitionController()
        dlq = FakeDlqPublisher()
        slept: list[float] = []

        def always_failing_ingestor(**kwargs):
            raise DatabaseError("Fallo persistente de base de datos")

        worker = ProjectionConsumerWorker(
            spec=PRODUCTS_CONSUMER_SPEC,
            controller=controller,
            dlq_publisher=dlq,
            sleep_fn=slept.append,
            jitter_fn=lambda: 0.0,
            ingestor_fn=always_failing_ingestor,
        )

        prod_evt = _build_product_event()
        record = KafkaRecord(
            topic=PRODUCTS_CONSUMER_SPEC.topic,
            partition=0,
            offset=7,
            key=prod_evt["aggregateId"],
            value=json.dumps(prod_evt).encode("utf-8"),
        )
        report = worker.process_record(record)

        self.assertEqual(report.status, "ISOLATED_DLQ")
        self.assertEqual(report.attempts, 6)
        self.assertEqual(tuple(slept), TRANSIENT_RETRY_DELAYS_SECONDS)
        self.assertEqual(len(dlq.published), 1)
        self.assertEqual(dlq.published[0][1].attempt_count, 6)
        self.assertEqual(controller.committed, [(PRODUCTS_CONSUMER_SPEC.topic, 0, 8)])

    def test_offset_is_not_committed_when_dlq_broker_fails(self):
        controller = FakePartitionController()
        dlq = FakeDlqPublisher(should_fail=True)
        worker = ProjectionConsumerWorker(
            spec=USERS_CONSUMER_SPEC,
            controller=controller,
            dlq_publisher=dlq,
            sleep_fn=lambda _: None,
            jitter_fn=lambda: 0.0,
        )

        record = KafkaRecord(
            topic=USERS_CONSUMER_SPEC.topic,
            partition=0,
            offset=15,
            key="bad",
            value=b"not-json",
        )
        with self.assertRaises(DlqDeliveryError):
            worker.process_record(record)

        self.assertEqual(controller.committed, [])


class SnapshotBootstrapTests(TestCase):
    def test_import_projection_snapshot_and_management_command(self):
        uid = str(uuid.uuid4())
        pid = str(uuid.uuid4())
        actor = str(uuid.uuid4())

        user_report = import_projection_snapshot(
            domain="user",
            items=[
                {
                    "userId": uid,
                    "email": "admin@techdistribution.com",
                    "displayName": "Admin Compras",
                    "active": True,
                    "assignments": [{"system": "PURCHASES", "role": "ADMIN"}],
                    "entityVersion": 2,
                },
                {
                    "userId": uid,
                    "email": "old@techdistribution.com",
                    "displayName": "Old Admin",
                    "active": True,
                    "assignments": [{"system": "PURCHASES", "role": "ADMIN"}],
                    "entityVersion": 1,
                },
            ],
            watermarks={"0": 120},
        )
        self.assertEqual(user_report.applied_count, 1)
        self.assertEqual(user_report.skipped_stale_count, 1)
        self.assertEqual(user_report.watermarks, {0: 120})

        snapshot_payload = {
            "watermarks": {"0": 45},
            "items": [
                {
                    "productId": pid,
                    "sku": "SSD-1TB",
                    "name": "SSD NVMe 1TB",
                    "stockOnHand": 50,
                    "active": True,
                    "createdBy": actor,
                    "updatedBy": actor,
                    "entityVersion": 1,
                }
            ],
        }
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", encoding="utf-8", delete=False
        ) as tmp:
            json.dump(snapshot_payload, tmp)
            tmp_path = Path(tmp.name)

        try:
            out = StringIO()
            call_command(
                "import_projection_snapshot",
                domain="product",
                file=str(tmp_path),
                stdout=out,
            )
            self.assertIn("applied=1", out.getvalue())
            self.assertTrue(ProductProjection.objects.filter(product_id=pid).exists())
        finally:
            tmp_path.unlink(missing_ok=True)
