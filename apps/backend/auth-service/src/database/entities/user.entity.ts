import {
  Check,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { bigintToNumber } from '../column-transformers';
import { UserSystemEntity } from './user-system.entity';

@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check(
  'ck_users_email_normalized',
  'email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254',
)
@Check(
  'ck_users_display_name',
  'display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 200',
)
@Check('ck_users_version', 'version >= 1')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_users',
  })
  id!: string;

  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  /** Hash Argon2id. Excluido de los SELECT por defecto: nunca sale de Auth. */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'bigint', default: 1, transformer: bigintToNumber })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @OneToMany(() => UserSystemEntity, (assignment) => assignment.user)
  assignments?: UserSystemEntity[];
}
