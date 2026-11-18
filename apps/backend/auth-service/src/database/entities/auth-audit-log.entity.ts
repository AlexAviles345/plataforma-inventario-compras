import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintToNumber } from '../column-transformers';

export const AUDIT_TARGET_TYPES = ['USER', 'SYSTEM', 'ASSIGNMENT'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * Registro append-only de bootstrap y operaciones administrativas. La base
 * rechaza UPDATE y DELETE mediante trigger; no sustituye al outbox.
 */
@Entity({ name: 'auth_audit_log' })
@Index('ix_auth_audit_log_target', ['targetType', 'targetKey', 'createdAt'])
@Index('ix_auth_audit_log_actor', ['actorUserId', 'createdAt'])
@Check(
  'ck_auth_audit_log_target_type',
  "target_type IN ('USER', 'SYSTEM', 'ASSIGNMENT')",
)
@Check(
  'ck_auth_audit_log_target_version',
  'target_version IS NULL OR target_version >= 1',
)
@Check('ck_auth_audit_log_details', "jsonb_typeof(details) = 'object'")
export class AuthAuditLogEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_auth_audit_log',
  })
  id!: string;

  /** Nulo únicamente para el bootstrap inicial. */
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  /** Acción estable, por ejemplo `BOOTSTRAP_ADMIN`. */
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 64 })
  targetType!: AuditTargetType;

  @Column({ name: 'target_key', type: 'varchar', length: 128, nullable: true })
  targetKey!: string | null;

  @Column({
    name: 'target_version',
    type: 'bigint',
    nullable: true,
    transformer: bigintToNumber,
  })
  targetVersion!: number | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  /** Metadatos saneados: jamás hashes, contraseñas ni tokens. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
