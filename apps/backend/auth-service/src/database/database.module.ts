import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions, databaseSettings } from './database-options';

const ENV_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_POOL_MAX',
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions(
          databaseSettings(
            Object.fromEntries(
              ENV_KEYS.map((key) => [key, config.getOrThrow<unknown>(key)]),
            ),
          ),
        ),
        // Arranque tolerante a que PostgreSQL tarde unos segundos en aceptar conexiones.
        retryAttempts: 5,
        retryDelay: 2_000,
      }),
    }),
  ],
})
export class DatabaseModule {}
