import type { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { OutboxEventEntity } from '../database/entities/outbox-event.entity';
import {
  USER_AGGREGATE_TYPE,
  USER_EVENTS_TOPIC,
  type UserEvent,
} from './user-event';

/**
 * Inserta el evento ya validado en `outbox_events` usando el `EntityManager`
 * de la transacción del cambio: o se confirman ambos o ninguno. La key Kafka es
 * el UUID del agregado; el publicador (fase 6) entrega en orden de versión.
 */
export async function enqueueUserEvent(
  manager: EntityManager,
  event: UserEvent,
): Promise<void> {
  await manager.insert(OutboxEventEntity, {
    eventId: event.eventId,
    aggregateType: USER_AGGREGATE_TYPE,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    entityVersion: event.entityVersion,
    topic: USER_EVENTS_TOPIC,
    partitionKey: event.aggregateId,
    payload: event as unknown as QueryDeepPartialEntity<
      Record<string, unknown>
    >,
    correlationId: event.correlationId,
    occurredAt: new Date(event.timestamp),
  });
}
