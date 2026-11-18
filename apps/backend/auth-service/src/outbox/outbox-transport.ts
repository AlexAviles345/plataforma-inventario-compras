/** Mensaje tal como lo consumen Inventory y Purchases. */
export interface OutboxMessage {
  topic: string;
  /** UUID del agregado en UTF-8: fija la partición y el orden. */
  key: string;
  /** Evento completo serializado como JSON. */
  value: string;
}

/**
 * Destino del publicador. `send` solo resuelve tras el acknowledgement del
 * broker (`acks=all`); cualquier rechazo deja el evento pendiente.
 */
export interface OutboxTransport {
  connect(): Promise<void>;
  send(message: OutboxMessage): Promise<void>;
  disconnect(): Promise<void>;
}

export const OUTBOX_TRANSPORT = Symbol('OUTBOX_TRANSPORT');
