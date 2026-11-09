import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { concurrently } from 'concurrently';
import { startInfrastructure } from './infra.mjs';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolsDirectory, '..');
const backendRoot = path.join(repositoryRoot, 'apps', 'backend');
const frontendRoot = path.join(repositoryRoot, 'apps', 'frontend');
const isWindows = process.platform === 'win32';

const servicePaths = {
  gateway: path.join(backendRoot, 'api-gateway'),
  auth: path.join(backendRoot, 'auth-service'),
  inventory: path.join(backendRoot, 'inventory-service'),
  purchases: path.join(backendRoot, 'purchases-service'),
};

const backendEndpoints = [
  {
    service: 'API Gateway',
    port: 3000,
    health: 'http://localhost:3000/health/live',
    swagger: 'http://localhost:3000/docs',
  },
  {
    service: 'Auth',
    port: 3001,
    health: 'http://localhost:3001/health/live',
    swagger: 'http://localhost:3001/docs',
  },
  {
    service: 'Inventory',
    port: 8081,
    health: 'http://localhost:8081/health/live',
    swagger: 'http://localhost:8081/docs',
  },
  {
    service: 'Purchases',
    port: 8000,
    health: 'http://localhost:8000/health/live',
    swagger: 'http://localhost:8000/docs',
  },
];

function frontendProjects() {
  const candidates = [];
  if (existsSync(path.join(frontendRoot, 'package.json'))) candidates.push(frontendRoot);

  if (existsSync(frontendRoot)) {
    for (const entry of readdirSync(frontendRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const directory = path.join(frontendRoot, entry.name);
        if (existsSync(path.join(directory, 'package.json'))) candidates.push(directory);
      }
    }
  }

  return candidates.map((directory) => {
    const packageJson = JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    );
    const script = packageJson.scripts?.dev
      ? 'dev'
      : packageJson.scripts?.['start:dev']
        ? 'start:dev'
        : undefined;
    return {
      directory,
      name: packageJson.name || path.basename(directory),
      script,
    };
  });
}

function requirements(frontends) {
  const requirements_ = [
    {
      label: 'Dependencias del Gateway',
      file: path.join(servicePaths.gateway, 'node_modules', '.bin', isWindows ? 'nest.cmd' : 'nest'),
      fix: 'cd apps/backend/api-gateway && npm ci --ignore-scripts',
    },
    {
      label: 'Configuración del Gateway',
      file: path.join(servicePaths.gateway, '.env'),
      fix: 'copia .env.example a .env y genera un JWT_SECRET seguro',
    },
    {
      label: 'Dependencias de Auth',
      file: path.join(servicePaths.auth, 'node_modules', '.bin', isWindows ? 'nest.cmd' : 'nest'),
      fix: 'cd apps/backend/auth-service && npm ci --ignore-scripts',
    },
    {
      label: 'Maven Wrapper de Inventory',
      file: path.join(servicePaths.inventory, isWindows ? 'mvnw.cmd' : 'mvnw'),
      fix: 'restaura el Maven Wrapper de apps/backend/inventory-service',
    },
    {
      label: 'Entorno virtual de Purchases',
      file: path.join(
        servicePaths.purchases,
        '.venv',
        isWindows ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'),
      ),
      fix: 'crea .venv e instala requirements-dev.txt en purchases-service',
    },
  ];

  for (const frontend of frontends) {
    requirements_.push({
      label: `Dependencias del frontend ${frontend.name}`,
      file: path.join(frontend.directory, 'node_modules'),
      fix: `ejecuta npm ci en ${path.relative(repositoryRoot, frontend.directory)}`,
    });
  }

  return requirements_;
}

function preflight(frontends) {
  const missing = requirements(frontends).filter(({ file }) => !existsSync(file));
  const invalidFrontends = frontends.filter(({ script }) => !script);

  if (missing.length > 0 || invalidFrontends.length > 0) {
    console.error('No se puede iniciar el entorno de desarrollo:');
    for (const item of missing) console.error(`- ${item.label}: ${item.fix}`);
    for (const frontend of invalidFrontends) {
      console.error(
        `- El frontend ${frontend.name} necesita un script "dev" o "start:dev"`,
      );
    }
    return false;
  }

  console.log('Preflight correcto: Gateway, Auth, Inventory y Purchases están listos.');
  if (frontends.length === 0) {
    console.log('No hay frontends todavía; se detectarán automáticamente al agregarlos.');
  } else {
    console.log(`Frontends detectados: ${frontends.map(({ name }) => name).join(', ')}`);
  }
  return true;
}

function portIsInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (inUse) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(inUse);
    };

    socket.setTimeout(750);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function portsAreAvailable() {
  const occupied = (
    await Promise.all(
      backendEndpoints.map(async (endpoint) => ({
        endpoint,
        inUse: await portIsInUse(endpoint.port),
      })),
    )
  ).filter(({ inUse }) => inUse);

  if (occupied.length === 0) return true;

  console.error('No se puede iniciar: estos puertos ya están ocupados:');
  for (const { endpoint } of occupied) {
    console.error(`- ${endpoint.service}: ${endpoint.port}`);
  }
  console.error('Detén la ejecución anterior con Ctrl+C y vuelve a intentarlo.');
  return false;
}

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
    ...frontends.map((frontend) => ({
      command: `npm run ${frontend.script}`,
      name: `frontend:${frontend.name}`,
      cwd: frontend.directory,
      prefixColor: 'blue',
    })),
  ];
}

function prepareApplications() {
  const python = isWindows
    ? path.join('.venv', 'Scripts', 'python.exe')
    : path.join('.venv', 'bin', 'python');
  console.log('Aplicando migraciones locales de Purchases...');
  const result = spawnSync(python, ['manage.py', 'migrate', '--noinput'], {
    cwd: servicePaths.purchases,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw new Error(`No se pudieron ejecutar las migraciones: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Las migraciones de Purchases terminaron con código ${result.status ?? 'desconocido'}`,
    );
  }
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

const frontends = frontendProjects();
if (!preflight(frontends)) process.exit(1);
if (!(await portsAreAvailable())) process.exit(1);

if (process.argv.includes('--check')) process.exit(0);

if (process.argv.includes('--with-infra')) {
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

console.log('Iniciando aplicaciones. Presiona Ctrl+C para detenerlas.');
console.log('La infraestructura permanece activa; usa npm run dev:down para detenerla.');

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
