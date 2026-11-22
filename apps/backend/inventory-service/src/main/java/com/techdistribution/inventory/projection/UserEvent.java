package com.techdistribution.inventory.projection;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Evento UserCreated/UserUpdated ya validado contra contracts/events/user-event.schema.json. */
public record UserEvent(
        UUID eventId,
        String eventType,
        UUID userId,
        long entityVersion,
        Instant occurredAt,
        UUID correlationId,
        String email,
        String displayName,
        boolean active,
        List<Assignment> assignments) {

    public record Assignment(String system, String role) {
    }
}
