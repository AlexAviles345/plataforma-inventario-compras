package com.techdistribution.inventory.outbox;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Ejecuta el publicador en segundo plano. Con OUTBOX_PUBLISHER_ENABLED=false los
 * eventos se acumulan en outbox_events y se envían al volver a activarlo.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "inventory.outbox", name = "publisher-enabled", havingValue = "true")
public class OutboxScheduler {

    private static final Logger log = LoggerFactory.getLogger(OutboxScheduler.class);

    private final OutboxPublisher publisher;

    public OutboxScheduler(OutboxPublisher publisher) {
        this.publisher = publisher;
    }

    @Scheduled(fixedDelayString = "${inventory.outbox.poll-interval-ms}", initialDelay = 2000)
    void publish() {
        try {
            publisher.publishPending();
        } catch (RuntimeException exception) {
            // Por ejemplo, MySQL no disponible: el siguiente ciclo vuelve a intentarlo.
            log.warn("Ciclo del publicador del outbox fallido: {}", exception.getMessage());
        }
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    void purge() {
        int deleted = publisher.purgePublished();
        if (deleted > 0) {
            log.info("Purga del outbox: {} eventos publicados eliminados", deleted);
        }
    }
}
