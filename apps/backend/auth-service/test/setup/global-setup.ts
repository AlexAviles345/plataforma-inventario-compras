import { DataSource } from 'typeorm';
import { validateDatabaseEnvironment } from '../../src/config/environment';
import {
  buildDataSourceOptions,
  databaseSettings,
} from '../../src/database/database-options';
import { applyTestEnvironment } from './test-env';

/**
 * Crea la base de pruebas si no existe, la vacía y aplica todas las
 * migraciones. Se niega a operar sobre una base cuyo nombre no termine en _test.
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnvironment();
  const settings = databaseSettings(validateDatabaseEnvironment(process.env));
  if (!/^[a-z0-9_]+_test$/.test(settings.database)) {
    throw new Error(
      `La base de pruebas debe terminar en _test; se recibió "${settings.database}"`,
    );
  }

  const admin = new DataSource({
    ...buildDataSourceOptions(settings),
    database: 'postgres',
    entities: [],
    migrations: [],
  });
  await admin.initialize();
  try {
    const rows: unknown[] = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [settings.database],
    );
    if (rows.length === 0)
      await admin.query(`CREATE DATABASE "${settings.database}"`);
  } finally {
    await admin.destroy();
  }

  const dataSource = new DataSource(buildDataSourceOptions(settings));
  await dataSource.initialize();
  try {
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
