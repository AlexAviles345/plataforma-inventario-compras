import uuid
from collections.abc import Callable
from contextvars import ContextVar

from django.http import HttpRequest, HttpResponse

_request_id_ctx: ContextVar[uuid.UUID | None] = ContextVar("request_id", default=None)
_actor_id_ctx: ContextVar[uuid.UUID | None] = ContextVar("actor_id", default=None)

REQUEST_ID_HEADER = "X-Request-Id"
META_REQUEST_ID_KEY = "HTTP_X_REQUEST_ID"


def parse_or_generate_request_id(raw_value: str | None) -> uuid.UUID:
    if raw_value:
        candidate = raw_value.strip()
        try:
            return uuid.UUID(candidate)
        except ValueError, AttributeError, TypeError:
            pass
    return uuid.uuid4()


def get_current_request_id() -> uuid.UUID:
    current = _request_id_ctx.get()
    if current is not None:
        return current
    generated = uuid.uuid4()
    _request_id_ctx.set(generated)
    return generated


def set_current_request_id(request_id: uuid.UUID | None) -> None:
    _request_id_ctx.set(request_id)


def get_current_actor_id() -> uuid.UUID | None:
    return _actor_id_ctx.get()


def set_current_actor_id(actor_id: uuid.UUID | None) -> None:
    _actor_id_ctx.set(actor_id)


class RequestContextMiddleware:
    """Propaga o genera X-Request-Id por petición y limpia el contexto al finalizar."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        raw_header = request.headers.get(REQUEST_ID_HEADER) or request.META.get(META_REQUEST_ID_KEY)
        request_id = parse_or_generate_request_id(raw_header)
        request.request_id = request_id  # type: ignore[attr-defined]

        req_token = _request_id_ctx.set(request_id)
        actor_token = _actor_id_ctx.set(None)
        try:
            response = self.get_response(request)
            response[REQUEST_ID_HEADER] = str(request_id)
            return response
        finally:
            _actor_id_ctx.reset(actor_token)
            _request_id_ctx.reset(req_token)
