package com.techdistribution.inventory.projection;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consumidor del grupo inventory.auth-users.v1. Corre dentro del propio servicio,
 * así que npm run dev no necesita un proceso adicional. Con
 * USERS_CONSUMER_ENABLED=false no se conecta a Kafka.
 */
@Component
public class UserEventsListener {

    private static final Logger log = LoggerFactory.getLogger(UserEventsListener.class);

    private final UserEventValidator validator;
    private final UserProjectionIngestor ingestor;
    private final UsersConsumerProperties properties;

    public UserEventsListener(
            UserEventValidator validator, UserProjectionIngestor ingestor, UsersConsumerProperties properties) {
        this.validator = validator;
        this.ingestor = ingestor;
        this.properties = properties;
    }

    @KafkaListener(
            id = "inventory-users-consumer",
            idIsGroup = false,
            groupId = "${inventory.users-consumer.group-id}",
            topics = "${inventory.users-consumer.topic}",
            autoStartup = "${inventory.users-consumer.enabled}",
            containerFactory = UsersConsumerConfiguration.CONTAINER_FACTORY)
    public void onUserEvent(ConsumerRecord<String, String> record) {
        UserEvent event = validator.validate(record.value(), record.key());
        UserProjectionIngestor.Outcome outcome = ingestor.ingest(event, record.value(),
                new UserProjectionIngestor.Position(
                        properties.groupId(), record.topic(), record.partition(), record.offset()));
        log.debug("Evento {} v{} del usuario {}: {}", event.eventType(), event.entityVersion(), event.userId(),
                outcome);
    }
}
