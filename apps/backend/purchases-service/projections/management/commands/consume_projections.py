from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from projections.consumers.config import CONSUMER_SPECS_BY_DOMAIN
from projections.consumers.consumer_worker import (
    ConfluentPartitionController,
    KafkaRecord,
    ProjectionConsumerWorker,
)
from projections.consumers.dlq_publisher import ConfluentDlqPublisher


class Command(BaseCommand):
    help = (
        "Ejecuta el consumidor Kafka de proyecciones para auth.users.events "
        "(user) o inventory.products.events (product) con commit manual de offsets."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--domain",
            type=str,
            required=True,
            choices=["user", "users", "product", "products"],
            help="Dominio de proyección a consumir ('user' o 'product').",
        )
        parser.add_argument(
            "--bootstrap-servers",
            type=str,
            default=None,
            help="Servidores bootstrap de Kafka (por defecto settings.KAFKA_BOOTSTRAP_SERVERS).",
        )
        parser.add_argument(
            "--max-messages",
            type=int,
            default=0,
            help="Límite de mensajes a procesar antes de detenerse (0 = ejecución continua).",
        )
        parser.add_argument(
            "--poll-timeout",
            type=float,
            default=1.0,
            help="Tiempo de espera por poll en segundos.",
        )
        parser.add_argument(
            "--auto-offset-reset",
            type=str,
            default="earliest",
            choices=["earliest", "latest"],
            help="Política inicial de offset cuando no existe offset confirmado.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        domain_key = str(options["domain"]).lower()
        spec = CONSUMER_SPECS_BY_DOMAIN.get(domain_key)
        if spec is None:
            raise CommandError(f"Dominio no soportado: {domain_key}")

        bootstrap_servers = str(
            options.get("bootstrap_servers")
            or getattr(settings, "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        )
        max_messages = int(options["max_messages"])
        poll_timeout = float(options["poll_timeout"])
        auto_offset_reset = str(options["auto_offset_reset"])

        from confluent_kafka import Consumer

        consumer_conf = {
            "bootstrap.servers": bootstrap_servers,
            "group.id": spec.consumer_group,
            "enable.auto.commit": False,
            "auto.offset.reset": auto_offset_reset,
        }
        consumer = Consumer(consumer_conf)
        controller = ConfluentPartitionController(consumer)
        dlq_publisher = ConfluentDlqPublisher(bootstrap_servers)
        worker = ProjectionConsumerWorker(
            spec=spec,
            controller=controller,
            dlq_publisher=dlq_publisher,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Iniciando consumidor '{spec.consumer_group}' sobre tópico '{spec.topic}' "
                f"(DLQ: '{spec.dlq_topic}', brokers: '{bootstrap_servers}')."
            )
        )

        processed = 0
        consumer.subscribe([spec.topic])
        try:
            while max_messages <= 0 or processed < max_messages:
                msg = consumer.poll(poll_timeout)
                if msg is None:
                    continue
                if msg.error():
                    self.stderr.write(f"Error de poll Kafka: {msg.error()}")
                    continue

                record = KafkaRecord(
                    topic=msg.topic() or spec.topic,
                    partition=int(msg.partition() or 0),
                    offset=int(msg.offset() or 0),
                    key=msg.key(),
                    value=msg.value() or b"",
                )
                report = worker.process_record(record)
                processed += 1
                self.stdout.write(
                    f"[{spec.consumer_group}] partition={record.partition} "
                    f"offset={record.offset} status={report.status} attempts={report.attempts}"
                )
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Consumidor detenido por señal de interrupción."))
        finally:
            consumer.close()
