import { randomUUID } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { UserEventType } from '../database/entities/outbox-event.entity';
import type { Assignment } from '../users/user-rules';
import envelopeSchema from './schemas/event-envelope.schema.json';
import userEventSchema from './schemas/user-event.schema.json';

export const USER_EVENTS_TOPIC = 'auth.users.events';
export const USER_AGGREGATE_TYPE = 'USER';
export const USER_EVENT_SCHEMA_VERSION = 1;

/** Snapshot público completo: nunca incluye hash ni credenciales. */
export interface PublicUserSnapshot {
  userId: string;
  email: string;
  displayName: string;
  active: boolean;
  assignments: Assignment[];
}

export interface UserEvent {
  eventId: string;
  eventType: UserEventType;
  schemaVersion: typeof USER_EVENT_SCHEMA_VERSION;
  aggregateId: string;
  entityVersion: number;
  timestamp: string;
  correlationId: string;
  data: PublicUserSnapshot;
}

/** El evento no pasa el contrato v1; es un error de programación, no del cliente. */
export class InvalidUserEventError extends Error {
  constructor(readonly problems: string[]) {
    super(`Evento de usuario inválido: ${problems.join('; ')}`);
    this.name = 'InvalidUserEventError';
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
addFormats(ajv);
ajv.addSchema(envelopeSchema);
const validateSchema = ajv.compile<UserEvent>(userEventSchema);

/**
 * Valida contra `user-event.schema.json` y las reglas que el README de
 * contracts/events exige además del schema: `aggregateId` igual a
 * `data.userId` y una sola asignación por sistema.
 */
export function assertValidUserEvent(event: UserEvent): void {
  const problems: string[] = [];
  if (!validateSchema(event))
    for (const error of validateSchema.errors ?? [])
      problems.push(`${error.instancePath || '/'} ${error.message ?? ''}`);
  if (event.aggregateId !== event.data?.userId)
    problems.push('aggregateId debe coincidir con data.userId');
  const systems = (event.data?.assignments ?? []).map((a) => a.system);
  if (new Set(systems).size !== systems.length)
    problems.push('una sola asignación por sistema');
  if (problems.length > 0) throw new InvalidUserEventError(problems);
}

export function buildUserEvent(params: {
  eventType: UserEventType;
  snapshot: PublicUserSnapshot;
  entityVersion: number;
  correlationId: string;
  occurredAt: Date;
}): UserEvent {
  const event: UserEvent = {
    eventId: randomUUID(),
    eventType: params.eventType,
    schemaVersion: USER_EVENT_SCHEMA_VERSION,
    aggregateId: params.snapshot.userId,
    entityVersion: params.entityVersion,
    timestamp: params.occurredAt.toISOString(),
    correlationId: params.correlationId,
    data: {
      userId: params.snapshot.userId,
      email: params.snapshot.email,
      displayName: params.snapshot.displayName,
      active: params.snapshot.active,
      assignments: params.snapshot.assignments.map(({ system, role }) => ({
        system,
        role,
      })),
    },
  };
  assertValidUserEvent(event);
  return event;
}
