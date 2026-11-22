package com.techdistribution.inventory.security;

/** Motivo interno de rechazo; al cliente solo se le devuelve INVALID_TOKEN. */
public class InvalidTokenException extends RuntimeException {

    public InvalidTokenException(String message) {
        super(message);
    }
}
