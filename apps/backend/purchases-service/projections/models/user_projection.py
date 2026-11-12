from typing import ClassVar

from django.db import models
from django.db.models import CheckConstraint, Index, Q
from django.utils import timezone


class UserProjection(models.Model):
    user_id = models.UUIDField(primary_key=True, editable=False)
    email = models.CharField(max_length=254)
    display_name = models.CharField(max_length=200)
    active = models.BooleanField()
    assignments = models.JSONField()
    entity_version = models.BigIntegerField()
    source_event_id = models.UUIDField()
    source_event_at = models.DateTimeField()
    projected_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "user_projections"
        indexes: ClassVar[list[Index]] = [
            Index(fields=["email"], name="idx_user_proj_email"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            CheckConstraint(
                condition=Q(entity_version__gte=1),
                name="chk_user_proj_version_gte_one",
            ),
            CheckConstraint(
                condition=~Q(email=""),
                name="chk_user_proj_email_nonempty",
            ),
            CheckConstraint(
                condition=~Q(display_name=""),
                name="chk_user_proj_name_nonempty",
            ),
        ]

    def __str__(self) -> str:
        return f"UserProjection({self.user_id}, email={self.email}, v={self.entity_version})"
