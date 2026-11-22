package com.techdistribution.inventory.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Fila del outbox. JPA solo la inserta junto con el producto; el publicador la
 * reclama y actualiza con SQL explícito (ver {@link OutboxPublisher}).
 */
@Entity
@Table(name = "outbox_events")
public class OutboxEvent {

    public static final String PENDING = "PENDING";

    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "event_id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID eventId;

    @Column(name = "aggregate_type", nullable = false, updatable = false)
    private String aggregateType;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "aggregate_id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID aggregateId;

    @Column(name = "event_type", nullable = false, updatable = false)
    private String eventType;

    @Column(name = "schema_version", nullable = false, updatable = false)
    private short schemaVersion;

    @Column(name = "entity_version", nullable = false, updatable = false)
    private long entityVersion;

    @Column(name = "topic", nullable = false, updatable = false)
    private String topic;

    @Column(name = "partition_key", nullable = false, updatable = false)
    private String partitionKey;

    @Column(name = "payload", columnDefinition = "json", nullable = false, updatable = false)
    private String payload;

    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "correlation_id", columnDefinition = "binary(16)", nullable = false, updatable = false)
    private UUID correlationId;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected OutboxEvent() {
    }

    static OutboxEvent pending(
            UUID eventId,
            String aggregateType,
            UUID aggregateId,
            String eventType,
            long entityVersion,
            String topic,
            String payload,
            UUID correlationId,
            Instant occurredAt) {
        OutboxEvent event = new OutboxEvent();
        event.eventId = eventId;
        event.aggregateType = aggregateType;
        event.aggregateId = aggregateId;
        event.eventType = eventType;
        event.schemaVersion = 1;
        event.entityVersion = entityVersion;
        event.topic = topic;
        event.partitionKey = aggregateId.toString();
        event.payload = payload;
        event.correlationId = correlationId;
        event.occurredAt = occurredAt;
        event.status = PENDING;
        event.attemptCount = 0;
        event.nextAttemptAt = occurredAt;
        event.createdAt = occurredAt;
        return event;
    }

    public UUID getEventId() {
        return eventId;
    }

    public UUID getAggregateId() {
        return aggregateId;
    }

    public String getEventType() {
        return eventType;
    }

    public long getEntityVersion() {
        return entityVersion;
    }

    public String getTopic() {
        return topic;
    }

    public String getPartitionKey() {
        return partitionKey;
    }

    public String getPayload() {
        return payload;
    }

    public String getStatus() {
        return status;
    }
}
