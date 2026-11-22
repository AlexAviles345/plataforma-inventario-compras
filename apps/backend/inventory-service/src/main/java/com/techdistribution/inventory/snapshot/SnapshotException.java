package com.techdistribution.inventory.snapshot;

/** Error de exportación o importación con un mensaje accionable para el operador. */
public class SnapshotException extends RuntimeException {

    public SnapshotException(String message) {
        super(message);
    }
}
