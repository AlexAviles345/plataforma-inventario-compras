package com.techdistribution.inventory.outbox;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "inventory.outbox")
public record OutboxProperties(
        boolean publisherEnabled,
        long pollIntervalMs,
        String topic,
        int batchSize,
        long leaseSeconds,
        long sendTimeoutSeconds,
        int retentionDays) {
}
