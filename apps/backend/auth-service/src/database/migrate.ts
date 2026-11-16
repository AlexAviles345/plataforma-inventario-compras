import { DataSource } from 'typeorm';
import { validateDatabaseEnvironment } from '../config/environment';
import { buildDataSourceOptions, databaseSettings } from './database-options';

/**
 * Ejecuta migraciones fuera de la aplicación HTTP:
 *   node dist/database/migrate.js run | revert | show
 * Lee `.env` si existe; las variables ya definidas en el proceso tienen prioridad.
 */
async function main(command: string | undefined): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sin .env se usan las variables del proceso y los valores locales por defecto.
  }
  const settings = databaseSettings(validateDatabaseEnvironment(process.env));
  const dataSource = new DataSource({
    ...buildDataSourceOptions(settings),
    logging: ['error', 'warn', 'migration'],
  });

  await dataSource.initialize();
  try {
    switch (command) {
      case 'run': {
        const applied = await dataSource.runMigrations({ transaction: 'each' });
        console.log(
          applied.length
            ? `Migraciones aplicadas: ${applied.map((m) => m.name).join(', ')}`
            : 'No hay migraciones pendientes',
        );
        break;
      }
      case 'revert':
        await dataSource.undoLastMigration({ transaction: 'each' });
        console.log('Última migración revertida');
        break;
      case 'show': {
        const pending = await dataSource.showMigrations();
        console.log(
          pending ? 'Hay migraciones pendientes' : 'Base de datos al día',
        );
        process.exitCode = pending ? 1 : 0;
        break;
      }
      default:
        throw new Error('Uso: migrate.js run | revert | show');
    }
  } finally {
    await dataSource.destroy();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(
    'Falló la ejecución de migraciones:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
