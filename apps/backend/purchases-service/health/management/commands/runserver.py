from django.conf import settings
from django.contrib.staticfiles.management.commands.runserver import (
    Command as StaticfilesRunserverCommand,
)


class Command(StaticfilesRunserverCommand):
    def on_bind(self, server_port: int) -> None:
        super().on_bind(server_port)

        if self._raw_ipv6:
            host = f"[{self.addr}]"
        elif self.addr in {"0", "0.0.0.0"}:
            host = "localhost"
        else:
            host = self.addr

        base_url = f"{self.protocol}://{host}:{server_port}"
        if getattr(settings, "DOCS_ENABLED", False):
            self.stdout.write(
                self.style.SUCCESS(
                    f"Swagger UI:     {base_url}/docs\n"
                    f"OpenAPI Schema: {base_url}/api/purchases/openapi.json"
                )
            )
        self.stdout.write(f"Health Check:   {base_url}/health/live")
