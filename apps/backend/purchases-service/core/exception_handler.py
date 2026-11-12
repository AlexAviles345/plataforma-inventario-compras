import math
from datetime import UTC, datetime
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    NotFound,
    ParseError,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response

from core.audit_context import REQUEST_ID_HEADER, get_current_request_id
from core.exceptions import ErrorCode, FieldErrorDetail, PurchasesDomainError

SERVICE_SOURCE = "purchases"


def utc_iso_timestamp() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _normalize_detail_code(raw_code: Any) -> str:
    if not raw_code:
        return ErrorCode.VALIDATION_ERROR
    code_str = str(raw_code).strip().upper().replace("-", "_").replace(" ", "_")
    return code_str or ErrorCode.VALIDATION_ERROR


def _flatten_validation_errors(
    data: Any,
    prefix: str = "",
) -> list[dict[str, str]]:
    collected: list[dict[str, str]] = []

    if isinstance(data, dict):
        for key, value in data.items():
            key_str = str(key)
            if key_str in {"non_field_errors", "__all__"}:
                next_prefix = prefix
            elif prefix:
                next_prefix = f"{prefix}.{key_str}"
            else:
                next_prefix = key_str
            collected.extend(_flatten_validation_errors(value, next_prefix))
        return collected

    if isinstance(data, list):
        has_nested_structures = any(isinstance(item, (dict, list)) for item in data)
        if has_nested_structures:
            for index, item in enumerate(data):
                if not item:
                    continue
                indexed_prefix = f"{prefix}[{index}]" if prefix else f"[{index}]"
                collected.extend(_flatten_validation_errors(item, indexed_prefix))
            return collected

        for item in data:
            raw_code = getattr(item, "code", None)
            entry: dict[str, str] = {
                "code": _normalize_detail_code(raw_code),
                "message": str(item),
            }
            if prefix:
                entry["field"] = prefix
            collected.append(entry)
        return collected

    raw_code = getattr(data, "code", None)
    entry = {
        "code": _normalize_detail_code(raw_code),
        "message": str(data),
    }
    if prefix:
        entry["field"] = prefix
    collected.append(entry)
    return collected


def build_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: list[dict[str, str]] | None = None,
    headers: dict[str, str] | None = None,
) -> Response:
    payload: dict[str, Any] = {
        "error": True,
        "statusCode": status_code,
        "code": code,
        "message": message,
        "source": SERVICE_SOURCE,
        "timestamp": utc_iso_timestamp(),
    }
    if details:
        payload["details"] = details

    merged_headers = dict(headers or {})
    merged_headers.setdefault(REQUEST_ID_HEADER, str(get_current_request_id()))
    return Response(payload, status=status_code, headers=merged_headers)


def purchases_exception_handler(
    exc: Exception,
    context: dict[str, Any],
) -> Response:
    if isinstance(exc, PurchasesDomainError):
        normalized_details = [
            item.to_dict() if isinstance(item, FieldErrorDetail) else dict(item)
            for item in exc.error_details
        ]
        return build_error_response(
            status_code=exc.status_code,
            code=exc.error_code,
            message=exc.message,
            details=normalized_details or None,
            headers=exc.response_headers,
        )

    if isinstance(exc, ValidationError):
        details = _flatten_validation_errors(exc.detail)
        return build_error_response(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=ErrorCode.VALIDATION_ERROR,
            message="La solicitud contiene datos inválidos",
            details=details or None,
        )

    if isinstance(exc, ParseError):
        return build_error_response(
            status_code=status.HTTP_400_BAD_REQUEST,
            code=ErrorCode.VALIDATION_ERROR,
            message="El cuerpo JSON de la solicitud es inválido",
        )

    if isinstance(exc, NotAuthenticated):
        return build_error_response(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=ErrorCode.AUTHENTICATION_REQUIRED,
            message="Se requiere autenticación para acceder a este recurso",
        )

    if isinstance(exc, AuthenticationFailed):
        return build_error_response(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=ErrorCode.INVALID_TOKEN,
            message=str(exc.detail)
            if exc.detail
            else "El token de acceso es inválido o ha expirado",
        )

    if isinstance(exc, (PermissionDenied, DjangoPermissionDenied)):
        return build_error_response(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCode.FORBIDDEN,
            message="No cuenta con permisos para realizar esta operación",
        )

    if isinstance(exc, (Http404, NotFound)):
        return build_error_response(
            status_code=status.HTTP_404_NOT_FOUND,
            code=ErrorCode.RESOURCE_NOT_FOUND,
            message="El recurso solicitado no existe",
        )

    if isinstance(exc, MethodNotAllowed):
        return build_error_response(
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
            code="METHOD_NOT_ALLOWED",
            message="Método HTTP no permitido para este endpoint",
        )

    if isinstance(exc, Throttled):
        headers: dict[str, str] = {}
        if exc.wait is not None:
            headers["Retry-After"] = str(max(1, math.ceil(exc.wait)))
        return build_error_response(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code=ErrorCode.RATE_LIMITED,
            message="Se ha excedido el límite de solicitudes permitidas",
            headers=headers,
        )

    if isinstance(exc, APIException):
        status_code = getattr(exc, "status_code", status.HTTP_500_INTERNAL_SERVER_ERROR)
        return build_error_response(
            status_code=status_code,
            code=_normalize_detail_code(getattr(exc, "default_code", ErrorCode.INTERNAL_ERROR)),
            message="No fue posible procesar la solicitud",
        )

    return build_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code=ErrorCode.INTERNAL_ERROR,
        message="Error interno del servidor",
    )
