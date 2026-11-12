from dataclasses import dataclass
from typing import Any

from rest_framework import status
from rest_framework.exceptions import APIException


class ErrorCode:
    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    INVALID_TOKEN = "INVALID_TOKEN"
    INVALID_REFRESH_TOKEN = "INVALID_REFRESH_TOKEN"
    FORBIDDEN = "FORBIDDEN"
    CSRF_VALIDATION_FAILED = "CSRF_VALIDATION_FAILED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    PROJECTION_NOT_READY = "PROJECTION_NOT_READY"
    PRODUCT_INACTIVE = "PRODUCT_INACTIVE"
    ORDER_STATE_CONFLICT = "ORDER_STATE_CONFLICT"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


@dataclass(frozen=True, slots=True)
class FieldErrorDetail:
    code: str
    message: str
    field: str | None = None

    def to_dict(self) -> dict[str, str]:
        payload: dict[str, str] = {}
        if self.field:
            payload["field"] = self.field
        payload["code"] = self.code
        payload["message"] = self.message
        return payload


class PurchasesDomainError(APIException):
    status_code: int = status.HTTP_400_BAD_REQUEST
    error_code: str = ErrorCode.VALIDATION_ERROR
    default_detail: str = "La solicitud no pudo procesarse"
    default_code: str = "domain_error"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: list[FieldErrorDetail | dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.default_detail
        if code is not None:
            self.error_code = code
        if status_code is not None:
            self.status_code = status_code
        self.error_details = details or []
        self.response_headers = headers or {}
        super().__init__(detail=self.message, code=self.error_code)


class DomainValidationError(PurchasesDomainError):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = ErrorCode.VALIDATION_ERROR
    default_detail = "La solicitud contiene datos inválidos"


class AuthenticationRequiredError(PurchasesDomainError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = ErrorCode.AUTHENTICATION_REQUIRED
    default_detail = "Se requiere autenticación para acceder a este recurso"


class InvalidTokenError(PurchasesDomainError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = ErrorCode.INVALID_TOKEN
    default_detail = "El token de acceso es inválido o ha expirado"


class ForbiddenDomainError(PurchasesDomainError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = ErrorCode.FORBIDDEN
    default_detail = "No cuenta con permisos para realizar esta operación"


class ResourceNotFoundError(PurchasesDomainError):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = ErrorCode.RESOURCE_NOT_FOUND
    default_detail = "El recurso solicitado no existe"


class VersionConflictError(PurchasesDomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = ErrorCode.VERSION_CONFLICT
    default_detail = "El recurso fue modificado por otra operación"


class IdempotencyConflictError(PurchasesDomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = ErrorCode.IDEMPOTENCY_CONFLICT
    default_detail = "La clave de idempotencia ya fue utilizada con una solicitud diferente"


class ProjectionNotReadyError(PurchasesDomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = ErrorCode.PROJECTION_NOT_READY
    default_detail = "La proyección requerida aún no está disponible"

    def __init__(
        self,
        message: str | None = None,
        *,
        retry_after_seconds: int = 2,
        details: list[FieldErrorDetail | dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            message=message,
            details=details,
            headers={"Retry-After": str(retry_after_seconds)},
        )


class ProductInactiveError(PurchasesDomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = ErrorCode.PRODUCT_INACTIVE
    default_detail = "El producto indicado se encuentra inactivo"


class OrderStateConflictError(PurchasesDomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = ErrorCode.ORDER_STATE_CONFLICT
    default_detail = "El estado actual de la orden no permite esta operación"
