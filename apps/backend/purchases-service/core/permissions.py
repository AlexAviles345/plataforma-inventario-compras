import uuid
from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from core.authentication import AuthenticatedActor
from core.exceptions import ForbiddenDomainError, ProjectionNotReadyError
from projections.models import UserProjection

PURCHASES_SYSTEM_CODE = "PURCHASES"
ALLOWED_PURCHASES_ROLES = frozenset({"ADMIN", "PURCHASES_AGENT"})


def _has_valid_purchases_assignment(assignments: Any) -> bool:
    if not isinstance(assignments, list):
        return False
    for entry in assignments:
        if (
            isinstance(entry, dict)
            and entry.get("system") == PURCHASES_SYSTEM_CODE
            and entry.get("role") in ALLOWED_PURCHASES_ROLES
        ):
            return True
    return False


class PurchasesAccessPermission(BasePermission):
    """Verifica RBAC del token para PURCHASES y estado/asignación en user_projections."""

    def has_permission(self, request: Request, view: Any) -> bool:
        actor = request.user
        if not isinstance(actor, AuthenticatedActor):
            return False

        if actor.system != PURCHASES_SYSTEM_CODE or actor.role not in ALLOWED_PURCHASES_ROLES:
            raise ForbiddenDomainError("El token fue emitido para otro sistema o rol no autorizado")

        projection = UserProjection.objects.filter(user_id=actor.user_id).first()
        if projection is None:
            raise ProjectionNotReadyError("La proyección local del usuario aún no está disponible")

        if not projection.active:
            raise ForbiddenDomainError("El usuario se encuentra inactivo")

        if not _has_valid_purchases_assignment(projection.assignments):
            raise ForbiddenDomainError(
                "El usuario no tiene una asignación activa para el sistema de compras"
            )

        request.user_projection = projection  # type: ignore[attr-defined]
        return True


def ensure_order_ownership(actor: AuthenticatedActor, order_requester_id: uuid.UUID) -> None:
    if actor.role == "ADMIN":
        return
    if actor.role == "PURCHASES_AGENT" and actor.user_id == order_requester_id:
        return
    raise ForbiddenDomainError(
        "No cuenta con permisos para consultar o modificar órdenes de otro usuario"
    )
