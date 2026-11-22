import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runDoctor } from './doctor.mjs';
import { startInfrastructure } from './infra.mjs';
import { setup } from './setup.mjs';
import {
  backendEndpoints,
  frontendProjects,
  isWindows,
  npmCommand,
  servicePaths,
} from './project.mjs';

/**
 * Enciende el proyecto completo con un comando:
 *   1. setup: instala dependencias y crea los .env que falten;
 *   2. doctor: verifica herramientas, Docker, configuración y puertos;
 *   3. infraestructura (con --with-infra): bases de datos y Kafka en Docker;
 *   4. migraciones de Auth y Purchases (Inventory aplica las suyas con Flyway al arrancar);
 *   5. Gateway, Auth, Inventory, Purchases, consumidores y frontends en paralelo.
 * `npm run dev:check` ejecuta solo el diagnóstico (tools/doctor.mjs).
 */

function commands(frontends) {
  const python = isWindows
    ? path.join('.venv', 'Scripts', 'python.exe')
    : path.join('.venv', 'bin', 'python');

  return [
    {
      command: 'npm run start:dev',
      name: 'gateway',
      cwd: servicePaths.gateway,
      prefixColor: 'cyan',
    },
    {
      command: 'npm run start:dev',
      name: 'auth',
      cwd: servicePaths.auth,
      prefixColor: 'magenta',
    },
    {
      command: isWindows ? 'mvnw.cmd spring-boot:run' : './mvnw spring-boot:run',
      name: 'inventory',
      cwd: servicePaths.inventory,
      prefixColor: 'yellow',
      env: { DEBUG: 'false' },
    },
    {
      command: `${python} manage.py runserver 0.0.0.0:8000`,
      name: 'purchases',
      cwd: servicePaths.purchases,
      prefixColor: 'green',
    },
    {
      command: `${python} manage.py consume_projections --domain user`,
      name: 'purchases:users',
      cwd: servicePaths.purchases,
      prefixColor: 'greenBright',
    },
    {
      command: `${python} manage.py consume_projections --domain product`,
      name: 'purchases:products',
      cwd: servicePaths.purchases,
      prefixColor: 'greenBright',
    },
    ...frontends.map((frontend) => ({
      command: `npm run ${frontend.script}`,
      name: `frontend:${frontend.name}`,
      cwd: frontend.directory,
      prefixColor: 'blue',
    })),
  ];
}

function runMigrations(service, command, args, options) {
  console.log(`Aplicando migraciones locales de ${service}...`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.error) {
    throw new Error(`No se pudieron ejecutar las migraciones: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Las migraciones de ${service} terminaron con código ${result.status ?? 'desconocido'}`,
    );
  }
}

function prepareApplications() {
  const [npm, npmArgs, npmOptions] = npmCommand(['run', 'migration:run']);
  runMigrations('Auth', npm, npmArgs, { cwd: servicePaths.auth, ...npmOptions });

  const python = isWindows
    ? path.join('.venv', 'Scripts', 'python.exe')
    : path.join('.venv', 'bin', 'python');
  runMigrations('Purchases', python, ['manage.py', 'migrate', '--noinput'], {
    cwd: servicePaths.purchases,
    shell: false,
  });
}

function delay(milliseconds, signal) {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

async function waitForHealth(endpoint, signal) {
  const deadline = Date.now() + 60_000;

  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch(endpoint.health, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1_500)]),
      });
      await response.body?.cancel();
      if (response.ok) return true;
    } catch {
      // El servicio puede seguir compilando; se reintenta hasta el plazo límite.
    }
    await delay(500, signal);
  }

  return false;
}

async function reportBackendEndpoints(signal) {
  const readiness = await Promise.all(
    backendEndpoints.map((endpoint) => waitForHealth(endpoint, signal)),
  );
  if (signal.aborted) return;

  console.log('\nServicios de desarrollo:');
  console.table(
    backendEndpoints.map((endpoint, index) => ({
      Servicio: endpoint.service,
      Estado: readiness[index] ? 'LISTO' : 'SIN RESPUESTA',
      Puerto: endpoint.port,
      Swagger: endpoint.swagger,
    })),
  );
  console.log('Estado verificado con GET /health/live en cada servicio.');
  console.log('Swagger agregado del Gateway: http://localhost:3000/docs');

  if (readiness.some((ready) => !ready)) {
    console.warn(
      'Algún servicio no respondió en 60 segundos; revisa sus logs antes de usarlo.',
    );
  }
}

const withInfrastructure = process.argv.includes('--with-infra');

try {
  setup();
} catch (error) {
  const message = error instanceof Error ? error.message : error;
  console.error(`\nNo se pudo preparar el entorno:\n${message}`);
  process.exit(1);
}

if (!(await runDoctor({ infrastructure: withInfrastructure }))) process.exit(1);

if (withInfrastructure) {
  try {
    startInfrastructure();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

try {
  prepareApplications();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const frontends = frontendProjects();
console.log('Iniciando aplicaciones. Presiona Ctrl+C para detenerlas.');
console.log('La infraestructura permanece activa; usa npm run dev:down para detenerla.');

// Se importa después de setup(), que instala concurrently si faltaba.
const { concurrently } = await import('concurrently');
const { result } = concurrently(commands(frontends), {
  prefix: 'name',
  killOthersOn: ['failure', 'success'],
  successCondition: 'all',
  handleInput: true,
});

const supervisorController = new AbortController();
const endpointReport = reportBackendEndpoints(supervisorController.signal);

try {
  await result;
} catch {
  process.exitCode = 1;
} finally {
  supervisorController.abort();
  await endpointReport;
}
