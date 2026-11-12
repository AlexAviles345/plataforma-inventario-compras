from django.db import models


class OrderCurrency(models.TextChoices):
    MXN = "MXN", "MXN"


class OrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "DRAFT"
    SUBMITTED = "SUBMITTED", "SUBMITTED"
    CANCELLED = "CANCELLED", "CANCELLED"


class ProductUnit(models.TextChoices):
    UNIT = "UNIT", "UNIT"


class IdempotencyOperation(models.TextChoices):
    CREATE_ORDER = "CREATE_ORDER", "CREATE_ORDER"
    SUBMIT_ORDER = "SUBMIT_ORDER", "SUBMIT_ORDER"
    CANCEL_ORDER = "CANCEL_ORDER", "CANCEL_ORDER"


class OrderHistoryAction(models.TextChoices):
    CREATED = "CREATED", "CREATED"
    UPDATED = "UPDATED", "UPDATED"
    SUBMITTED = "SUBMITTED", "SUBMITTED"
    CANCELLED = "CANCELLED", "CANCELLED"
