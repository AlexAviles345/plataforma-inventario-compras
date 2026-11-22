package com.techdistribution.inventory.projection;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "inventory.users-consumer")
public record UsersConsumerProperties(
        boolean enabled,
        String topic,
        String groupId,
        String dlqTopic,
        List<Long> retryDelaysMs,
        long maxJitterMs,
        long dlqSendTimeoutSeconds) {

    public UsersConsumerProperties {
        retryDelaysMs = retryDelaysMs == null ? List.of() : List.copyOf(retryDelaysMs);
    }

    /** Intentos totales de un fallo transitorio: el primero más cada reintento. */
    public int maxAttempts() {
        return 1 + retryDelaysMs.size();
    }
}
