import math
from collections.abc import Mapping, Sequence
from typing import Any

from rest_framework import status
from rest_framework.response import Response

from core.exceptions import DomainValidationError, FieldErrorDetail


def success_response(
    *,
    data: Any,
    message: str,
    status_code: int = status.HTTP_200_OK,
    meta: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> Response:
    payload: dict[str, Any] = {
        "error": False,
        "statusCode": status_code,
        "message": message,
        "data": data,
    }
    if meta is not None:
        payload["meta"] = meta
    return Response(payload, status=status_code, headers=headers)


def build_pagination_meta(*, page: int, limit: int, total: int) -> dict[str, int]:
    total_pages = math.ceil(total / limit) if total > 0 else 0
    return {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": total_pages,
    }


def paginated_response(
    *,
    items: Sequence[Any],
    page: int,
    limit: int,
    total: int,
    message: str,
    status_code: int = status.HTTP_200_OK,
) -> Response:
    return success_response(
        data=list(items),
        message=message,
        status_code=status_code,
        meta=build_pagination_meta(page=page, limit=limit, total=total),
    )


def parse_pagination_params(
    query_params: Mapping[str, Any],
    *,
    default_limit: int = 20,
    max_limit: int = 100,
) -> tuple[int, int]:
    details: list[FieldErrorDetail] = []

    raw_page = query_params.get("page")
    if raw_page is None or str(raw_page).strip() == "":
        page = 1
    else:
        try:
            page = int(str(raw_page).strip())
            if page < 1:
                details.append(
                    FieldErrorDetail(
                        field="page",
                        code="INVALID_PAGE",
                        message="Debe ser un entero mayor o igual a 1",
                    )
                )
        except ValueError:
            page = 1
            details.append(
                FieldErrorDetail(
                    field="page",
                    code="INVALID_PAGE",
                    message="Debe ser un número entero válido",
                )
            )

    raw_limit = query_params.get("limit")
    if raw_limit is None or str(raw_limit).strip() == "":
        limit = default_limit
    else:
        try:
            limit = int(str(raw_limit).strip())
            if limit < 1 or limit > max_limit:
                details.append(
                    FieldErrorDetail(
                        field="limit",
                        code="INVALID_LIMIT",
                        message=f"Debe estar entre 1 y {max_limit}",
                    )
                )
        except ValueError:
            limit = default_limit
            details.append(
                FieldErrorDetail(
                    field="limit",
                    code="INVALID_LIMIT",
                    message="Debe ser un número entero válido",
                )
            )

    if details:
        raise DomainValidationError(
            "Los parámetros de paginación son inválidos",
            details=details,
        )

    return page, limit
