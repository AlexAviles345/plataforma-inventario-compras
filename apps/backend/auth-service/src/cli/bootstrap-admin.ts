import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthDomainError } from '../common/errors';
import { runWithRequestId } from '../common/request-context';
import { UsersService } from '../users/users.service';
import { PromptCancelledError, readNewPassword } from './password-prompt';

export const BOOTSTRAP_EMAIL_VAR = 'BOOTSTRAP_ADMIN_EMAIL';
export const BOOTSTRAP_NAME_VAR = 'BOOTSTRAP_ADMIN_DISPLAY_NAME';

export interface BootstrapDependencies {
  env: NodeJS.ProcessEnv;
  users: Pick<UsersService, 'bootstrapAdmin' | 'hasActiveAdmin'>;
  readPassword: () => Promise<string>;
  out: (line: string) => void;
  err: (line: string) => void;
}

/**
 * Crea el primer ADMIN fuera del HTTP público. Devuelve el código de salida:
 * 0 si lo creó o si ya existía un ADMIN activo (idempotente), 1 ante datos
 * inválidos o un email ya registrado. Nunca imprime la contraseña ni el hash.
 */
export async function runBootstrapAdmin(
  deps: BootstrapDependencies,
): Promise<number> {
  const email = deps.env[BOOTSTRAP_EMAIL_VAR]?.trim();
  const displayName = deps.env[BOOTSTRAP_NAME_VAR]?.trim();
  if (!email || !displayName) {
    deps.err(
      `Define ${BOOTSTRAP_EMAIL_VAR} y ${BOOTSTRAP_NAME_VAR} solo para esta ejecución; la contraseña se solicita aparte.`,
    );
    return 1;
  }

  // Evita pedir la contraseña si no hay nada que hacer. La comprobación que
  // decide se repite dentro de la transacción, con candado.
  if (await deps.users.hasActiveAdmin()) {
    deps.out('Ya existe un administrador activo; no se realizaron cambios.');
    return 0;
  }

  const password = await deps.readPassword();
  try {
    const result = await runWithRequestId(randomUUID(), () =>
      deps.users.bootstrapAdmin({ email, displayName, password }),
    );
    if (!result.created) {
      deps.out('Ya existe un administrador activo; no se realizaron cambios.');
      return 0;
    }
    deps.out(
      `Administrador creado: ${result.user.email} (${result.user.id}), ADMIN en INVENTORY y PURCHASES.`,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof AuthDomainError)) throw error;
    deps.err(error.message);
    for (const detail of error.details)
      deps.err(`  - ${detail.field ?? 'general'}: ${detail.message}`);
    return 1;
  }
}

async function main(): Promise<number> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sin .env se usan las variables del proceso y los valores locales por defecto.
  }
  // Comando de vida corta: el evento queda en el outbox y lo publica el
  // servicio Auth. No se conecta a Kafka ni retrasa la salida si no está.
  process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    return await runBootstrapAdmin({
      env: process.env,
      users: app.get(UsersService),
      readPassword: () =>
        readNewPassword({
          input: process.stdin,
          output: process.stderr,
          notice: (line) => console.error(line),
        }),
      out: (line) => console.log(line),
      err: (line) => console.error(line),
    });
  } finally {
    await app.close();
  }
}

if (require.main === module)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof PromptCancelledError) {
        console.error(error.message);
        process.exitCode = 130;
        return;
      }
      console.error(
        'Falló el bootstrap del administrador:',
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    });
