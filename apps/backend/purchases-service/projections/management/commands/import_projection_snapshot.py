import json
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from projections.services.bootstrap_service import import_projection_snapshot


class Command(BaseCommand):
    help = (
        "Importa un snapshot JSON consistente de proyecciones (user o product) "
        "con versión monotónica y watermarks por partición."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--domain",
            type=str,
            required=True,
            choices=["user", "product"],
            help="Dominio de proyección a importar ('user' o 'product').",
        )
        parser.add_argument(
            "--file",
            type=str,
            required=True,
            help="Ruta al archivo JSON con las claves 'items' y opcionalmente 'watermarks'.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        domain = str(options["domain"])
        file_path = Path(str(options["file"]))
        if not file_path.is_file():
            raise CommandError(f"El archivo de snapshot no existe: {file_path}")

        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise CommandError(f"No se pudo leer el archivo JSON de snapshot: {exc}") from exc

        if isinstance(payload, list):
            items = payload
            watermarks = None
        elif isinstance(payload, dict):
            raw_items = payload.get("items")
            if not isinstance(raw_items, list):
                raise CommandError("El objeto JSON debe incluir una lista en 'items'.")
            items = raw_items
            raw_watermarks = payload.get("watermarks")
            if raw_watermarks is not None and not isinstance(raw_watermarks, dict):
                raise CommandError("El campo 'watermarks' debe ser un objeto JSON.")
            watermarks = raw_watermarks
        else:
            raise CommandError("El snapshot JSON debe ser una lista o un objeto con 'items'.")

        try:
            report = import_projection_snapshot(
                domain=domain,
                items=items,
                watermarks=watermarks,
            )
        except Exception as exc:
            raise CommandError(f"Error al importar snapshot de proyecciones: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Snapshot '{report.domain}' importado: applied={report.applied_count}, "
                f"skipped_stale={report.skipped_stale_count}, watermarks={report.watermarks}"
            )
        )
