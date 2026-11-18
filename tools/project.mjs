import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Rutas, puertos y utilidades compartidas por los scripts de desarrollo. */

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(toolsDirectory, '..');
export const isWindows = process.platform === 'win32';

const backendRoot = path.join(repositoryRoot, 'apps', 'backend');
const frontendRoot = path.join(repositoryRoot, 'apps', 'frontend');

export const servicePaths = {
  gateway: path.join(backendRoot, 'api-gateway'),
  auth: path.join(backendRoot, 'auth-service'),
  inventory: path.join(backendRoot, 'inventory-service'),
  purchases: path.join(backendRoot, 'purchases-service'),
};

export const backendEndpoints = [
  { service: 'API Gateway', port: 3000, health: 'http://localhost:3000/health/live', swagger: 'http://localhost:3000/docs' },
  { service: 'Auth', port: 3001, health: 'http://localhost:3001/health/live', swagger: 'http://localhost:3001/docs' },
  { service: 'Inventory', port: 8081, health: 'http://localhost:8081/health/live', swagger: 'http://localhost:8081/docs' },
  { service: 'Purchases', port: 8000, health: 'http://localhost:8000/health/live', swagger: 'http://localhost:8000/docs' },
];

/** Servicios de docker-compose.example.yml que levanta `npm run dev`. */
export const infrastructureServices = [
  { service: 'postgres-auth', container: 'auth-db', port: 5432, label: 'PostgreSQL de Auth' },
  { service: 'postgres-purchases', container: 'purchases-db', port: 5433, label: 'PostgreSQL de Purchases' },
  { service: 'mysql-inventory', container: 'inventory-db', port: 3306, label: 'MySQL de Inventory' },
  { service: 'kafka', container: 'kafka-broker', port: 9092, label: 'Kafka' },
];

/** Servicios Node cuyo `.env` comparte JWT_SECRET, issuer y audience. */
export const jwtEnvironmentFiles = [
  { label: 'Gateway', directory: servicePaths.gateway },
  { label: 'Auth', directory: servicePaths.auth },
  { label: 'Purchases', directory: servicePaths.purchases },
];

export const nestBinary = (directory) =>
  path.join(directory, 'node_modules', '.bin', isWindows ? 'nest.cmd' : 'nest');

export const venvPython = (directory = servicePaths.purchases) =>
  path.join(
    directory,
    '.venv',
    isWindows ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'),
  );

export const kafkaNativeBinding = path.join(
  servicePaths.auth,
  'node_modules',
  '@confluentinc',
  'kafka-javascript',
  'build',
  'Release',
  'confluent-kafka-javascript.node',
);

export const nodeMajor = Number(process.versions.node.split('.')[0]);
export const REQUIRED_NODE_MAJOR = 24;

export function frontendProjects() {
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
    const packageJson = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const script = packageJson.scripts?.dev
      ? 'dev'
      : packageJson.scripts?.['start:dev']
        ? 'start:dev'
        : undefined;
    return { directory, name: packageJson.name || path.basename(directory), script };
  });
}

/** Lee un archivo .env simple (CLAVE=valor); devuelve undefined si no existe. */
export function readEnvFile(file) {
  if (!existsSync(file)) return undefined;
  const values = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    let value = line.slice(index + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    values[line.slice(0, index).trim()] = value;
  }
  return values;
}

/** Ejecuta un comando y captura su salida sin mostrarla. */
export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
    ...options,
  });
  return {
    ok: !result.error && result.status === 0,
    missing: result.error?.code === 'ENOENT',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

/** Ejecuta un comando mostrando su salida; lanza un error si falla. */
export function run(label, command, args, options = {}) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label}: terminó con código ${result.status ?? 'desconocido'}`);
  }
}

/**
 * npm es un .cmd en Windows y requiere shell. Los argumentos son siempre fijos
 * y se pasan como una sola línea (Node desaconseja shell con lista de args).
 */
export const npmCommand = (args) =>
  isWindows ? [['npm', ...args].join(' '), [], { shell: true }] : ['npm', args, {}];

export function npm(label, args, cwd) {
  const [command, commandArgs, options] = npmCommand(args);
  run(label, command, commandArgs, { cwd, ...options });
}

/** Proceso que escucha en un puerto TCP local (mejor esfuerzo, para mensajes). */
export function processOnPort(port) {
  if (isWindows) {
    const netstat = capture('netstat', ['-ano', '-p', 'TCP']);
    const line = netstat.output
      .split(/\r?\n/)
      .find((row) => new RegExp(`:${port}\\s+\\S+\\s+LISTENING`).test(row));
    const pid = line?.trim().split(/\s+/).pop();
    if (!pid) return undefined;
    const task = capture('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    const name = /^"([^"]+)"/.exec(task.output)?.[1];
    return name ? `${name} (PID ${pid})` : `PID ${pid}`;
  }
  const lsof = capture('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
  const pid = /^p(\d+)/m.exec(lsof.output)?.[1];
  const name = /^c(.+)$/m.exec(lsof.output)?.[1];
  return pid ? `${name ?? 'proceso'} (PID ${pid})` : undefined;
}
