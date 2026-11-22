package com.techdistribution.inventory.security;

import java.util.UUID;

/** Identidad verificada a partir del access token. */
public record AuthenticatedActor(UUID userId, String email, String role, String system) {
}
