from django.db import models


class InboxOutcome(models.TextChoices):
    APPLIED = "APPLIED", "APPLIED"
    IGNORED_STALE = "IGNORED_STALE", "IGNORED_STALE"


class ProjectionProductUnit(models.TextChoices):
    UNIT = "UNIT", "UNIT"
