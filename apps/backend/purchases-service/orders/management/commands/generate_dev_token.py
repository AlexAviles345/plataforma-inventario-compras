import base64
import hashlib
import hmac
import json
import time
import uuid
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.utils import timezone

from projections.models import ProductProjection, ProjectionProductUnit, UserProjection

DEFAULT_ADMIN_USER_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
DEFAULT_AGENT_USER_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")

SAMPLE_PRODUCTS: tuple[dict[str, Any], ...] = (
    {
        "product_id": uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"),
        "sku": "LAP-DELL-5540",
        "name": "Laptop Dell Latitude 5540 Core i7 16GB",
        "stock_on_hand": 25,
    },
    {
        "product_id": uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"),
        "sku": "MON-LG-27UL850",
        "name": "Monitor LG UltraFine 27 4K USB-C",
        "stock_on_hand": 40,
    },
    {
        "product_id": uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"),
        "sku": "DOCK-WD19TBS",
        "name": "Docking Station Dell Thunderbolt WD19TBS",
        "stock_on_hand": 15,
    },
)


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def mint_hs256_access_token(
    *,
    user_id: uuid.UUID,
    email: str,
    role: str,
    system: str = "PURCHASES",
    ttl_seconds: int = 900,
) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "system": system,
        "iat": now,
        "exp": now + ttl_seconds,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
    }
    header_part = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    signature = hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    return f"{header_part}.{payload_part}.{_b64url_encode(signature)}"


class Command(BaseCommand):
    help = (
        "Genera un access token JWT HS256 de desarrollo para PURCHASES y sincroniza "
        "el usuario y productos de prueba en las proyecciones locales (solo DEBUG=True)."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--role",
            type=str,
            default="ADMIN",
            choices=["ADMIN", "PURCHASES_AGENT"],
            help="Rol del token y de la proyección local (ADMIN o PURCHASES_AGENT).",
        )
        parser.add_argument(
            "--user-id",
            type=str,
            default=None,
            help="UUID del usuario (por defecto usa un UUID determinista según el rol).",
        )
        parser.add_argument(
            "--email",
            type=str,
            default=None,
            help="Correo del usuario en el token y en user_projections.",
        )
        parser.add_argument(
            "--ttl",
            type=int,
            default=900,
            help="Tiempo de vida del token en segundos (por defecto 900).",
        )
        parser.add_argument(
            "--no-seed-products",
            action="store_true",
            help="No insertar/actualizar los productos de muestra en product_projections.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError(
                "El comando generate_dev_token solo está permitido cuando DJANGO_DEBUG=true."
            )

        role = str(options["role"]).upper()
        default_uid = DEFAULT_ADMIN_USER_ID if role == "ADMIN" else DEFAULT_AGENT_USER_ID
        raw_uid = options.get("user_id")
        try:
            user_id = uuid.UUID(str(raw_uid)) if raw_uid else default_uid
        except ValueError as exc:
            raise CommandError("El parámetro --user-id debe ser un UUID válido.") from exc

        default_email = (
            "admin.compras@techdistribution.com"
            if role == "ADMIN"
            else "agente.compras@techdistribution.com"
        )
        email = str(options.get("email") or default_email).strip().lower()
        ttl = int(options["ttl"])
        if ttl < 1 or ttl > settings.JWT_MAX_TTL_SECONDS:
            raise CommandError(
                f"El parámetro --ttl debe estar entre 1 y {settings.JWT_MAX_TTL_SECONDS} segundos."
            )

        now = timezone.now()
        user_proj, created = UserProjection.objects.update_or_create(
            user_id=user_id,
            defaults={
                "email": email,
                "display_name": f"Usuario Dev ({role})",
                "active": True,
                "assignments": [{"system": "PURCHASES", "role": role}],
                "entity_version": 1,
                "source_event_id": uuid.uuid4(),
                "source_event_at": now,
                "projected_at": now,
            },
        )
        if not created and user_proj.entity_version < 1:
            user_proj.entity_version = 1
            user_proj.save(update_fields=["entity_version"])

        if not options.get("no_seed_products"):
            for item in SAMPLE_PRODUCTS:
                ProductProjection.objects.update_or_create(
                    product_id=item["product_id"],
                    defaults={
                        "sku": item["sku"],
                        "name": item["name"],
                        "unit": ProjectionProductUnit.UNIT,
                        "stock_on_hand": item["stock_on_hand"],
                        "active": True,
                        "created_by": user_id,
                        "updated_by": user_id,
                        "entity_version": 1,
                        "source_event_id": uuid.uuid4(),
                        "source_event_at": now,
                        "projected_at": now,
                    },
                )

        token = mint_hs256_access_token(
            user_id=user_id,
            email=email,
            role=role,
            system="PURCHASES",
            ttl_seconds=ttl,
        )
        sample_idem_key = uuid.uuid4()
        sample_body = {
            "supplierName": "Distribuidora Mayorista Tech S.A. de C.V.",
            "lines": [
                {
                    "productId": str(SAMPLE_PRODUCTS[0]["product_id"]),
                    "quantity": 2,
                    "unitPrice": "24500.50",
                },
                {
                    "productId": str(SAMPLE_PRODUCTS[1]["product_id"]),
                    "quantity": 4,
                    "unitPrice": "8900.00",
                },
            ],
        }

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== ENTORNO DE PRUEBA LOCAL LISTO (PURCHASES) ==="))
        self.stdout.write(f"  Usuario en proyección : {user_id} ({email})")
        self.stdout.write(f"  Rol / Sistema         : {role} / PURCHASES")
        self.stdout.write(f"  Vigencia (TTL)        : {ttl} segundos")
        if not options.get("no_seed_products"):
            self.stdout.write("  Productos en catálogo :")
            for prod in SAMPLE_PRODUCTS:
                self.stdout.write(f"    - {prod['product_id']} | {prod['sku']} | {prod['name']}")
        self.stdout.write("")
        self.stdout.write(
            self.style.HTTP_INFO("1) Token JWT (pegar en el botón 'Authorize' de /docs):")
        )
        self.stdout.write(token)
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO("2) Idempotency-Key de ejemplo para POST:"))
        self.stdout.write(str(sample_idem_key))
        self.stdout.write("")
        self.stdout.write(
            self.style.HTTP_INFO("3) Body JSON de ejemplo para POST /api/purchases/orders:")
        )
        self.stdout.write(json.dumps(sample_body, indent=2, ensure_ascii=False))
        self.stdout.write("")
