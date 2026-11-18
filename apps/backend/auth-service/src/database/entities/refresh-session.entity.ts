import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import type { SystemCode } from '../../access/access-matrix';

@Entity({ name: 'refresh_sessions' })
@Unique('uq_refresh_sessions_token_hash', ['tokenHash'])
@Index('ix_refresh_sessions_family', ['familyId'])
@Index('ix_refresh_sessions_user_active', ['userId', 'revokedAt', 'expiresAt'])
@Check('ck_refresh_sessions_token_hash', 'char_length(token_hash) = 64')
@Check('ck_refresh_sessions_csrf_hash', 'char_length(csrf_hash) = 64')
@Check('ck_refresh_sessions_expiry', 'expires_at > created_at')
export class RefreshSessionEntity {
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'pk_refresh_sessions' })
  id!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'system_code', type: 'varchar', length: 32 })
  systemCode!: SystemCode;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'csrf_hash', type: 'char', length: 64 })
  csrfHash!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | null;
}
