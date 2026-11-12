import base64
import hashlib
import hmac
import json
import re
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.http import HttpRequest
from rest_framework.authentication import BaseAuthentication

from core.audit_context import set_current_actor_id
from core.exceptions import AuthenticationRequiredError, InvalidTokenError

_B64URL_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_UUID_CANONICAL_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_BEARER_RE = re.compile(r"^Bearer ([^\s]+)$", re.IGNORECASE)

VALID_ROLES = frozenset({"ADMIN", "INVENTORY_MANAGER", "PURCHASES_AGENT"})
VALID_SYSTEMS = frozenset({"INVENTORY", "PURCHASES"})
CLOCK_SKEW_SECONDS = 30

UNTRUSTED_META_HEADERS = (
    "HTTP_X_USER_ID",
    "HTTP_X_USER_ROLES",
    "HTTP_X_USER_SYSTEM",
    "HTTP_X_FORWARDED_FOR",
    "HTTP_X_FORWARDED_PROTO",
    "HTTP_X_FORWARDED_HOST",
    "HTTP_FORWARDED",
)


@dataclass(frozen=True, slots=True)
class AuthenticatedActor:
    user_id: uuid.UUID
    email: str
    role: str
    system: str
    iat: int
    exp: int

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    if not segment or not _B64URL_RE.match(segment):
        raise InvalidTokenError("Segmento JWT con codificación Base64URL inválida")
    padding = "=" * (-len(segment) % 4)
    try:
        return base64.urlsafe_b64decode(segment + padding)
    except Exception as exc:
        raise InvalidTokenError("No fue posible decodificar el token JWT") from exc


def encode_hs256_jwt(
    payload: Mapping[str, Any],
    secret: str,
    header: Mapping[str, Any] | None = None,
) -> str:
    jwt_header = dict(header) if header is not None else {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_encode(
        json.dumps(jwt_header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_b64 = _b64url_encode(json.dumps(dict(payload), separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_b64 = _b64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _is_strict_int(value: Any) -> bool:
    return type(value) is int


def _is_valid_role_system_combination(role: str, system: str) -> bool:
    if role == "ADMIN":
        return system in VALID_SYSTEMS
    if role == "INVENTORY_MANAGER":
        return system == "INVENTORY"
    if role == "PURCHASES_AGENT":
        return system == "PURCHASES"
    return False


def verify_access_token(
    token: str,
    *,
    secret: str,
    issuer: str,
    audience: str,
    max_ttl_seconds: int,
    now_timestamp: int | None = None,
) -> AuthenticatedActor:
    parts = token.split(".")
    if len(parts) != 3:
        raise InvalidTokenError("Formato de token JWT inválido")

    header_b64, payload_b64, signature_b64 = parts
    header_bytes = _b64url_decode(header_b64)
    payload_bytes = _b64url_decode(payload_b64)
    signature_bytes = _b64url_decode(signature_b64)

    try:
        header = json.loads(header_bytes.decode("utf-8"))
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise InvalidTokenError("El contenido JSON del token es inválido") from exc

    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise InvalidTokenError("Estructura de header o payload JWT inválida")

    if header.get("alg") != "HS256" or header.get("typ") != "JWT":
        raise InvalidTokenError("Algoritmo o tipo de token no permitido")

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    if not hmac.compare_digest(signature_bytes, expected_signature):
        raise InvalidTokenError("Firma del token JWT inválida")

    if "roles" in payload:
        raise InvalidTokenError("El claim 'roles' no está permitido; use 'role' singular")

    sub = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role")
    system = payload.get("system")
    iat = payload.get("iat")
    exp = payload.get("exp")
    iss = payload.get("iss")
    aud = payload.get("aud")

    if iss != issuer or aud != audience:
        raise InvalidTokenError("Emisor o audiencia del token inválidos")

    if not isinstance(sub, str) or not _UUID_CANONICAL_RE.match(sub):
        raise InvalidTokenError("El claim 'sub' debe ser un UUID canónico válido")

    if not isinstance(email, str) or not _EMAIL_RE.match(email):
        raise InvalidTokenError("El claim 'email' no es válido")

    if (
        not isinstance(role, str)
        or role not in VALID_ROLES
        or not isinstance(system, str)
        or system not in VALID_SYSTEMS
        or not _is_valid_role_system_combination(role, system)
    ):
        raise InvalidTokenError("Combinación de rol y sistema inválida en el token")

    if not _is_strict_int(iat) or not _is_strict_int(exp):
        raise InvalidTokenError("Los claims 'iat' y 'exp' deben ser enteros en segundos UTC")

    now = int(time.time()) if now_timestamp is None else now_timestamp
    if (
        iat <= 0
        or iat > now + CLOCK_SKEW_SECONDS
        or exp <= now
        or exp <= iat
        or (exp - iat) > max_ttl_seconds
    ):
        raise InvalidTokenError("El token de acceso ha expirado o su vigencia es inválida")

    return AuthenticatedActor(
        user_id=uuid.UUID(sub),
        email=email,
        role=role,
        system=system,
        iat=iat,
        exp=exp,
    )


def strip_untrusted_identity_headers(request: HttpRequest) -> None:
    for meta_key in UNTRUSTED_META_HEADERS:
        request.META.pop(meta_key, None)


class PurchasesJwtAuthentication(BaseAuthentication):
    """Valida autónomamente el access token JWT HS256 conforme al contrato de TechDistribution."""

    def authenticate(self, request: HttpRequest) -> tuple[AuthenticatedActor, str]:
        strip_untrusted_identity_headers(request)

        auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION")
        if not auth_header or not auth_header.strip():
            raise AuthenticationRequiredError("Token de acceso no proporcionado")

        match = _BEARER_RE.match(auth_header.strip())
        if not match:
            raise InvalidTokenError("El encabezado Authorization debe usar el esquema Bearer")

        raw_token = match.group(1)
        actor = verify_access_token(
            raw_token,
            secret=settings.JWT_SECRET,
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            max_ttl_seconds=settings.JWT_MAX_TTL_SECONDS,
        )
        set_current_actor_id(actor.user_id)
        return actor, raw_token

    def authenticate_header(self, request: HttpRequest) -> str:
        return "Bearer"
