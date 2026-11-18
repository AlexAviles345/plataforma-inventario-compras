import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import type { SystemCode } from '../../access/access-matrix';
import { bigintToNumber } from '../column-transformers';

@Entity({ name: 'systems' })
@Check('ck_systems_code', "code IN ('INVENTORY', 'PURCHASES')")
@Check(
  'ck_systems_access_token_ttl',
  'access_token_ttl_seconds > 0 AND access_token_ttl_seconds <= 3600',
)
@Check('ck_systems_version', 'version >= 1')
export class SystemEntity {
  @PrimaryColumn({
    type: 'varchar',
    length: 32,
    primaryKeyConstraintName: 'pk_systems',
  })
  code!: SystemCode;

  /** Vigencia de los access tokens emitidos para este sistema. */
  @Column({ name: 'access_token_ttl_seconds', type: 'integer' })
  accessTokenTtlSeconds!: number;

  @Column({ type: 'bigint', default: 1, transformer: bigintToNumber })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
