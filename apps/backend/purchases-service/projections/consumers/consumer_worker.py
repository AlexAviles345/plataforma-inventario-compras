import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from projections.consumers.config import (
    MAX_JITTER_SECONDS,
    TRANSIENT_RETRY_DELAYS_SECONDS,
    ConsumerGroupSpec,
)
from projections.consumers.dlq_publisher import (
    DlqPublisherProtocol,
    build_dlq_envelope,
)
from projections.services.projection_ingestor import IngestionResult, ingest_domain_event
from projections.services.schema_validator import PermanentEventValidationError


@dataclass(frozen=True, slots=True)
class KafkaRecord:
    topic: str
    partition: int
    offset: int
    key: str | bytes | None
    value: bytes | str


@dataclass(frozen=True, slots=True)
class RecordProcessingReport:
    status: str
    attempts: int
    committed_offset: int | None
    ingestion_result: IngestionResult | None = None


class PartitionControllerProtocol(Protocol):
    def pause_partition(self, topic: str, partition: int) -> None: ...

    def resume_partition(self, topic: str, partition: int) -> None: ...

    def commit_offset(self, topic: str, partition: int, next_offset: int) -> None: ...


class ProjectionConsumerWorker:
    """Ejecuta ingesta atómica con 5 reintentos, pausa de partición y aislamiento DLQ."""

    def __init__(
        self,
        *,
        spec: ConsumerGroupSpec,
        controller: PartitionControllerProtocol,
        dlq_publisher: DlqPublisherProtocol,
        retry_delays: tuple[float, ...] = TRANSIENT_RETRY_DELAYS_SECONDS,
        sleep_fn: Callable[[float], None] = time.sleep,
        jitter_fn: Callable[[], float] | None = None,
        ingestor_fn: Callable[..., IngestionResult] = ingest_domain_event,
    ) -> None:
        self.spec = spec
        self.controller = controller
        self.dlq_publisher = dlq_publisher
        self.retry_delays = retry_delays
        self.sleep_fn = sleep_fn
        self.jitter_fn = jitter_fn or (lambda: random.uniform(0.0, MAX_JITTER_SECONDS))
        self.ingestor_fn = ingestor_fn

    def process_record(self, record: KafkaRecord) -> RecordProcessingReport:
        attempt = 0
        max_attempts = 1 + len(self.retry_delays)
        last_error: Exception | None = None

        while attempt < max_attempts:
            attempt += 1
            try:
                result = self.ingestor_fn(
                    raw_payload=record.value,
                    expected_domain=self.spec.domain,
                    consumer_group=self.spec.consumer_group,
                    topic=record.topic,
                    partition_number=record.partition,
                    offset_value=record.offset,
                    partition_key=record.key,
                )
                next_offset = record.offset + 1
                self.controller.commit_offset(
                    record.topic,
                    record.partition,
                    next_offset,
                )
                status_label = "COMMITTED" if attempt == 1 else "COMMITTED_AFTER_RETRY"
                return RecordProcessingReport(
                    status=status_label,
                    attempts=attempt,
                    committed_offset=next_offset,
                    ingestion_result=result,
                )
            except PermanentEventValidationError as perm_exc:
                return self._isolate_to_dlq(
                    record=record,
                    error=perm_exc,
                    attempt_count=attempt,
                )
            except Exception as trans_exc:
                last_error = trans_exc
                if attempt >= max_attempts:
                    break
                delay = self.retry_delays[attempt - 1] + max(0.0, self.jitter_fn())
                self.controller.pause_partition(record.topic, record.partition)
                try:
                    self.sleep_fn(delay)
                finally:
                    self.controller.resume_partition(record.topic, record.partition)

        assert last_error is not None
        return self._isolate_to_dlq(
            record=record,
            error=last_error,
            attempt_count=attempt,
        )

    def _isolate_to_dlq(
        self,
        *,
        record: KafkaRecord,
        error: Exception,
        attempt_count: int,
    ) -> RecordProcessingReport:
        envelope = build_dlq_envelope(
            consumer_group=self.spec.consumer_group,
            original_topic=record.topic,
            partition=record.partition,
            offset=record.offset,
            partition_key=record.key,
            raw_payload=record.value,
            error=error,
            attempt_count=attempt_count,
        )
        # Si la publicación en DLQ lanza DlqDeliveryError, el offset original NO se confirma.
        self.dlq_publisher.publish(self.spec.dlq_topic, envelope)
        next_offset = record.offset + 1
        self.controller.commit_offset(record.topic, record.partition, next_offset)
        return RecordProcessingReport(
            status="ISOLATED_DLQ",
            attempts=attempt_count,
            committed_offset=next_offset,
            ingestion_result=None,
        )


class ConfluentPartitionController:
    """Adaptador de control de particiones y commit manual sobre confluent_kafka.Consumer."""

    def __init__(self, consumer: object) -> None:
        self._consumer = consumer

    def pause_partition(self, topic: str, partition: int) -> None:
        from confluent_kafka import TopicPartition

        self._consumer.pause([TopicPartition(topic, partition)])  # type: ignore[attr-defined]

    def resume_partition(self, topic: str, partition: int) -> None:
        from confluent_kafka import TopicPartition

        self._consumer.resume([TopicPartition(topic, partition)])  # type: ignore[attr-defined]

    def commit_offset(self, topic: str, partition: int, next_offset: int) -> None:
        from confluent_kafka import TopicPartition

        self._consumer.commit(  # type: ignore[attr-defined]
            offsets=[TopicPartition(topic, partition, next_offset)],
            asynchronous=False,
        )
