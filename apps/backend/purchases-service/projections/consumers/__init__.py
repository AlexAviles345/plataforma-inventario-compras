"""Consumidores Kafka para proyecciones de usuarios y productos."""

from projections.consumers.config import (
    CONSUMER_SPECS_BY_DOMAIN,
    MAX_JITTER_SECONDS,
    PRODUCTS_CONSUMER_SPEC,
    TRANSIENT_RETRY_DELAYS_SECONDS,
    USERS_CONSUMER_SPEC,
    ConsumerGroupSpec,
)
from projections.consumers.consumer_worker import (
    ConfluentPartitionController,
    KafkaRecord,
    PartitionControllerProtocol,
    ProjectionConsumerWorker,
    RecordProcessingReport,
)
from projections.consumers.dlq_publisher import (
    ConfluentDlqPublisher,
    DlqDeliveryError,
    DlqEnvelope,
    DlqPublisherProtocol,
    build_dlq_envelope,
    sanitize_error_message,
)

__all__ = [
    "CONSUMER_SPECS_BY_DOMAIN",
    "MAX_JITTER_SECONDS",
    "PRODUCTS_CONSUMER_SPEC",
    "TRANSIENT_RETRY_DELAYS_SECONDS",
    "USERS_CONSUMER_SPEC",
    "ConfluentDlqPublisher",
    "ConfluentPartitionController",
    "ConsumerGroupSpec",
    "DlqDeliveryError",
    "DlqEnvelope",
    "DlqPublisherProtocol",
    "KafkaRecord",
    "PartitionControllerProtocol",
    "ProjectionConsumerWorker",
    "RecordProcessingReport",
    "build_dlq_envelope",
    "sanitize_error_message",
]
