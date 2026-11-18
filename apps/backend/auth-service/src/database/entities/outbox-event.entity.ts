import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { bigintToNumber } from '../column-transformers';

export const OUTBOX_STATUSES = ['PENDING', 'PUBLISHING', 'PUBLISHED'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export type UserEventType = 'UserCreated' | 'UserUpdated';

/**
 * Evento pendiente de publicar en Kafka. Se inserta en la misma transacción
 * que el cambio del usuario (docs/architecture/event-driven-communication.md).
 */
@Entity({ name: 'outbox_events' })
@Unique('uq_outbox_events_aggregate_version', ['aggregateId', 'entityVersion'])
@Index('ix_outbox_events_dispatch', ['status', 'nextAttemptAt', 'createdAt'])
@Check('ck_outbox_events_aggregate_type', "aggregate_type = 'USER'")
@Check(
  'ck_outbox_events_event_type',
  "event_type IN ('UserCreated', 'UserUpdated')",
)
@Check('ck_outbox_events_schema_version', 'schema_version >= 1')
@Check('ck_outbox_events_entity_version', 'entity_version >= 1')
@Check('ck_outbox_events_partition_key', 'partition_key = aggregate_id::text')
@Check('ck_outbox_events_payload', "jsonb_typeof(payload) = 'object'")
@Check(
  'ck_outbox_events_status',
  "status IN ('PENDING', 'PUBLISHING', 'PUBLISHED')",
)
@Check('ck_outbox_events_attempt_count', 'attempt_count >= 0')
@Check(
  'ck_outbox_events_published_at',
  "(status = 'PUBLISHED') = (published_at IS NOT NULL)",
)
@Check(
  'ck_outbox_events_lease',
  "(locked_at IS NULL) = (locked_by IS NULL) AND (status <> 'PUBLISHING' OR locked_at IS NOT NULL)",
)
export class OutboxEventEntity {
  /** Coincide con `eventId` del evento publicado. */
  @PrimaryColumn({
    name: 'event_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_outbox_events',
  })
  eventId!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64 })
  aggregateType!: 'USER';

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: UserEventType;

  @Column({ name: 'schema_version', type: 'smallint' })
  schemaVersion!: number;

  @Column({
    name: 'entity_version',
    type: 'bigint',
    transformer: bigintToNumber,
  })
  entityVersion!: number;

  @Column({ type: 'varchar', length: 255 })
  topic!: string;

  /** UUID canónico del agregado; key del mensaje Kafka. */
  @Column({ name: 'partition_key', type: 'varchar', length: 128 })
  partitionKey!: string;

  /** Evento completo ya validado contra el JSON Schema. */
  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: OutboxStatus;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextAttemptAt!: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'locked_by', type: 'varchar', length: 128, nullable: true })
  lockedBy!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  /** Error saneado, sin payloads ni secretos. */
  @Column({ name: 'last_error', type: 'varchar', length: 1000, nullable: true })
  lastError!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
