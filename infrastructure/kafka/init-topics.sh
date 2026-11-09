#!/usr/bin/env bash
set -euo pipefail
broker="${KAFKA_BOOTSTRAP_SERVERS:-kafka:29092}"
for topic in auth.users.events inventory.products.events; do
  kafka-topics --bootstrap-server "$broker" --create --if-not-exists \
    --topic "$topic" --partitions 3 --replication-factor 1 \
    --config retention.ms=604800000
done
for topic in inventory.auth-users.dlq purchases.auth-users.dlq purchases.inventory-products.dlq; do
  kafka-topics --bootstrap-server "$broker" --create --if-not-exists \
    --topic "$topic" --partitions 3 --replication-factor 1 \
    --config retention.ms=2592000000
done
kafka-topics --bootstrap-server "$broker" --list
