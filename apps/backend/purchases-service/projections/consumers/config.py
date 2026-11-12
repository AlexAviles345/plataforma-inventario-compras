from dataclasses import dataclass

TRANSIENT_RETRY_DELAYS_SECONDS: tuple[float, ...] = (1.0, 2.0, 4.0, 8.0, 16.0)
MAX_JITTER_SECONDS: float = 0.25


@dataclass(frozen=True, slots=True)
class ConsumerGroupSpec:
    domain: str
    topic: str
    consumer_group: str
    dlq_topic: str


USERS_CONSUMER_SPEC = ConsumerGroupSpec(
    domain="user",
    topic="auth.users.events",
    consumer_group="purchases.auth-users.v1",
    dlq_topic="purchases.auth-users.dlq",
)

PRODUCTS_CONSUMER_SPEC = ConsumerGroupSpec(
    domain="product",
    topic="inventory.products.events",
    consumer_group="purchases.inventory-products.v1",
    dlq_topic="purchases.inventory-products.dlq",
)

CONSUMER_SPECS_BY_DOMAIN: dict[str, ConsumerGroupSpec] = {
    "user": USERS_CONSUMER_SPEC,
    "users": USERS_CONSUMER_SPEC,
    "product": PRODUCTS_CONSUMER_SPEC,
    "products": PRODUCTS_CONSUMER_SPEC,
}
