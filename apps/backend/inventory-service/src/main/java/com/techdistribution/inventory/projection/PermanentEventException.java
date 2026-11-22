package com.techdistribution.inventory.projection;

/**
 * Evento que nunca podrá aplicarse tal como está (schema, tipos, identidad). No se
 * reintenta: va directo a la DLQ y el offset avanza.
 */
public class PermanentEventException extends RuntimeException {

    public PermanentEventException(String message) {
        super(message);
    }
}
