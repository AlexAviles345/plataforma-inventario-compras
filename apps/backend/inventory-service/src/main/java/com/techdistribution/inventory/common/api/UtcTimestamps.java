package com.techdistribution.inventory.common.api;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * Fechas UTC con precisión de microsegundos, la misma que guarda MySQL
 * {@code datetime(6)} y la máxima que aceptan los consumidores de eventos.
 */
public final class UtcTimestamps {

    private static final DateTimeFormatter ISO_MICROS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'").withZone(ZoneOffset.UTC);

    private UtcTimestamps() {
    }

    public static Instant now() {
        return truncate(Instant.now());
    }

    public static Instant truncate(Instant instant) {
        return instant.truncatedTo(ChronoUnit.MICROS);
    }

    public static String format(Instant instant) {
        return ISO_MICROS.format(instant);
    }
}
