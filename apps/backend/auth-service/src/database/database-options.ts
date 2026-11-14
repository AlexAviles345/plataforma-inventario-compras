import type { DataSourceOptions } from 'typeorm';
import { AuthAuditLogEntity } from './entities/auth-audit-log.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { SystemEntity } from './entities/system.entity';
import { UserSystemEntity } from './entities/user-system.entity';
import { UserEntity } from './entities/user.entity';
import { CreateUsers1794614400001 } from './migrations/1794614400001-CreateUsers';
import { CreateSystems1794614400002 } from './migrations/1794614400002-CreateSystems';
import { CreateUserSystems1794614400003 } from './migrations/1794614400003-CreateUserSystems';
import { CreateAuthAuditLog1794614400004 } from './migrations/1794614400004-CreateAuthAuditLog';
import { CreateOutboxEvents1794614400005 } from './migrations/1794614400005-CreateOutboxEvents';

/** Listas explícitas: no dependen de globs ni de si se ejecuta .ts o .js. */
export const ENTITIES = [
  UserEntity,
  SystemEntity,
  UserSystemEntity,
  AuthAuditLogEntity,
  OutboxEventEntity,
];

export const MIGRATIONS = [
  CreateUsers1794614400001,
  CreateSystems1794614400002,
  CreateUserSystems1794614400003,
  CreateAuthAuditLog1794614400004,
  CreateOutboxEvents1794614400005,
];

export interface DatabaseSettings {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  poolMax: number;
}

/** Extrae la configuración de base de datos ya validada por validateEnvironment. */
export function databaseSettings(
  env: Record<string, unknown>,
): DatabaseSettings {
  return {
    host: env.DB_HOST as string,
    port: env.DB_PORT as number,
    database: env.DB_NAME as string,
    username: env.DB_USER as string,
    password: env.DB_PASSWORD as string,
    poolMax: env.DB_POOL_MAX as number,
  };
}

/**
 * Opciones únicas para la aplicación, el script de migraciones y las pruebas.
 * El esquema solo cambia mediante migraciones: synchronize siempre es false.
 */
export function buildDataSourceOptions(
  settings: DatabaseSettings,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: settings.host,
    port: settings.port,
    database: settings.database,
    username: settings.username,
    password: settings.password,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'each',
    synchronize: false,
    // gen_random_uuid() es nativo desde PostgreSQL 13; el esquema lo crean las migraciones.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    applicationName: 'auth-service',
    extra: {
      max: settings.poolMax,
      connectionTimeoutMillis: 5_000,
    },
  };
}
