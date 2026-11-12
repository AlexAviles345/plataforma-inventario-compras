import base64
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

_SECRET_PATTERN = re.compile(
    r"(bearer\s+[a-z0-9_\-\.]+|password\s*[:=]\s*\S+|secret\s*[:=]\s*\S+)",
    re.IGNORECASE,
)


class DlqDeliveryError(RuntimeError):
    """Fallo al publicar en la DLQ; impide confirmar el offset original."""


def sanitize_error_message(raw_message: str, max_length: int = 500) -> str:
    cleaned = _SECRET_PATTERN.sub("[REDACTED]", raw_message or "Error desconocido")
    cleaned = " ".join(cleaned.split())
    return cleaned[:max_length]


@dataclass(frozen=True, slots=True)
class DlqEnvelope:
    consumer_group: str
    original_topic: str
    partition: int
    offset: int
    partition_key: str | None
    raw_payload: str
    payload_encoding: str
    error_type: str
    error_message: str
    attempt_count: int
    failed_at: str

    def to_json_bytes(self) -> bytes:
        payload: dict[str, Any] = {
            "consumerGroup": self.consumer_group,
            "originalTopic": self.original_topic,
            "partition": self.partition,
            "offset": self.offset,
            "partitionKey": self.partition_key,
            "rawPayload": self.raw_payload,
            "payloadEncoding": self.payload_encoding,
            "errorType": self.error_type,
            "errorMessage": self.error_message,
            "attemptCount": self.attempt_count,
            "failedAt": self.failed_at,
        }
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def build_dlq_envelope(
    *,
    consumer_group: str,
    original_topic: str,
    partition: int,
    offset: int,
    partition_key: str | bytes | None,
    raw_payload: bytes | str,
    error: Exception,
    attempt_count: int,
) -> DlqEnvelope:
    if isinstance(partition_key, bytes):
        key_str: str | None = partition_key.decode("utf-8", errors="replace")
    elif partition_key is not None:
        key_str = str(partition_key)
    else:
        key_str = None

    if isinstance(raw_payload, bytes):
        try:
            payload_str = raw_payload.decode("utf-8")
            encoding = "utf-8"
        except UnicodeDecodeError:
            payload_str = base64.b64encode(raw_payload).decode("ascii")
            encoding = "base64"
    else:
        payload_str = str(raw_payload)
        encoding = "utf-8"

    failed_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    return DlqEnvelope(
        consumer_group=consumer_group,
        original_topic=original_topic,
        partition=partition,
        offset=offset,
        partition_key=key_str,
        raw_payload=payload_str,
        payload_encoding=encoding,
        error_type=error.__class__.__name__,
        error_message=sanitize_error_message(str(error)),
        attempt_count=attempt_count,
        failed_at=failed_at,
    )


class DlqPublisherProtocol(Protocol):
    def publish(self, dlq_topic: str, envelope: DlqEnvelope) -> None: ...


class ConfluentDlqPublisher:
    """Publicador DLQ síncrono con confirmación de broker obligatoria (acks=all)."""

    def __init__(self, bootstrap_servers: str) -> None:
        from confluent_kafka import Producer

        self._producer = Producer(
            {
                "bootstrap.servers": bootstrap_servers,
                "acks": "all",
                "enable.idempotence": True,
                "retries": 3,
            }
        )

    def publish(self, dlq_topic: str, envelope: DlqEnvelope) -> None:
        delivery_errors: list[str] = []
        acknowledged = False

        def _on_delivery(err: Any, _msg: Any) -> None:
            nonlocal acknowledged
            if err is not None:
                delivery_errors.append(str(err))
            else:
                acknowledged = True

        key_bytes = (
            envelope.partition_key.encode("utf-8") if envelope.partition_key is not None else None
        )
        try:
            self._producer.produce(
                topic=dlq_topic,
                key=key_bytes,
                value=envelope.to_json_bytes(),
                on_delivery=_on_delivery,
            )
            remaining = self._producer.flush(timeout=10.0)
        except Exception as exc:
            raise DlqDeliveryError(
                f"No fue posible publicar en la DLQ '{dlq_topic}': {exc}"
            ) from exc

        if remaining > 0 or delivery_errors or not acknowledged:
            reason = delivery_errors[0] if delivery_errors else "timeout de confirmación"
            raise DlqDeliveryError(
                f"El broker no confirmó la publicación en la DLQ '{dlq_topic}': {reason}"
            )
