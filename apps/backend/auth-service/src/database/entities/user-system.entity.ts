import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Role, SystemCode } from '../../access/access-matrix';
import { SystemEntity } from './system.entity';
import { UserEntity } from './user.entity';

/** Asignación de un usuario a un sistema con un rol; una por sistema. */
@Entity({ name: 'user_systems' })
@Unique('uq_user_systems_user_system', ['userId', 'systemCode'])
@Check(
  'ck_user_systems_role',
  "(system_code = 'INVENTORY' AND role IN ('ADMIN', 'INVENTORY_MANAGER')) OR " +
    "(system_code = 'PURCHASES' AND role IN ('ADMIN', 'PURCHASES_AGENT'))",
)
export class UserSystemEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_user_systems',
  })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'system_code', type: 'varchar', length: 32 })
  systemCode!: SystemCode;

  @Column({ type: 'varchar', length: 32 })
  role!: Role;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.assignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_systems_user',
  })
  user?: UserEntity;

  @ManyToOne(() => SystemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'system_code',
    foreignKeyConstraintName: 'fk_user_systems_system',
  })
  system?: SystemEntity;
}
