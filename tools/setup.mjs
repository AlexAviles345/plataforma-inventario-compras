import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findPython } from './doctor.mjs';
import {
  REQUIRED_NODE_MAJOR,
  frontendProjects,
  jwtEnvironmentFiles,
  kafkaNativeBinding,
  nestBinary,
  nodeMajor,
  npm,
  readEnvFile,
  repositoryRoot,
  run,
  servicePaths,
  venvPython,
} from './project.mjs';

/**
 * Prepara lo que falte para ejecutar el proyecto en local. Es idempotente:
 * solo actúa sobre lo ausente y nunca modifica un .env existente.
 */

const NPM_CI = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
const secret = () => randomBytes(48).toString('base64url');
const isUsableSecret = (value) =>
  Boolean(value) && !/replace/i.test(value) && Buffer.byteLength(value, 'utf8') >= 32;

function requireNode(reason) {
  if (nodeMajor !== REQUIRED_NODE_MAJOR) {
    throw new Error(
      `${reason} requiere Node ${REQUIRED_NODE_MAJOR}.x (tienes ${process.versions.node}). ` +
        `Instala Node ${REQUIRED_NODE_MAJOR} LTS y vuelve a ejecutar el comando.`,
    );
  }
}

function setupRoot(actions) {
  if (existsSync(path.join(repositoryRoot, 'node_modules', 'concurrently'))) return;
  requireNode('Instalar las dependencias de la raíz');
  npm('Instalando dependencias de la raíz', NPM_CI, repositoryRoot);
  actions.push('dependencias de la raíz');
}

/** Crea los .env que falten con un único JWT_SECRET compartido. */
function setupEnvironmentFiles(actions) {
  const existing = jwtEnvironmentFiles
    .map(({ directory }) => readEnvFile(path.join(directory, '.env'))?.JWT_SECRET)
    .find(isUsableSecret);
  const jwtSecret = existing ?? secret();

  for (const { label, directory } of jwtEnvironmentFiles) {
    const target = path.join(directory, '.env');
    if (existsSync(target)) continue;
    const example = readFileSync(path.join(directory, '.env.example'), 'utf8');
    const content = example
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwtSecret}`)
      .replace(/^DJANGO_SECRET_KEY=.*$/m, `DJANGO_SECRET_KEY=${secret()}`);
    writeFileSync(target, content);
    actions.push(`.env de ${label}${existing ? ' (con el JWT_SECRET existente)' : ''}`);
  }
}

function setupNodeService(label, directory, actions) {
  if (existsSync(nestBinary(directory))) return;
  requireNode(`Instalar las dependencias de ${label}`);
  npm(`Instalando dependencias de ${label}`, NPM_CI, directory);
  actions.push(`dependencias de ${label}`);
}

/** npm ci --ignore-scripts no descarga el binario nativo de librdkafka. */
function setupKafkaBinding(actions) {
  if (existsSync(kafkaNativeBinding) || !existsSync(nestBinary(servicePaths.auth))) return;
  if (nodeMajor !== REQUIRED_NODE_MAJOR) {
    console.warn(
      `Aviso: el binario de Kafka de Auth solo existe para Node ${REQUIRED_NODE_MAJOR}; ` +
        'Auth arrancará, pero sus eventos quedarán en el outbox.',
    );
    return;
  }
  npm(
    'Descargando el binario de Kafka de Auth',
    ['rebuild', '@confluentinc/kafka-javascript'],
    servicePaths.auth,
  );
  actions.push('binario de Kafka de Auth');
}

function setupPurchases(actions) {
  if (existsSync(venvPython())) return;
  const python = findPython();
  if (!python) throw new Error('Crear el entorno de Purchases requiere Python 3.14.');
  run('Creando el entorno virtual de Purchases', python.command, [...python.prefix, '-m', 'venv', '.venv'], {
    cwd: servicePaths.purchases,
  });
  run(
    'Instalando dependencias de Purchases',
    venvPython(),
    ['-m', 'pip', 'install', '--disable-pip-version-check', '--requirement', 'requirements-dev.txt'],
    { cwd: servicePaths.purchases },
  );
  actions.push('entorno virtual de Purchases');
}

function setupFrontends(actions) {
  for (const frontend of frontendProjects()) {
    if (existsSync(path.join(frontend.directory, 'node_modules'))) continue;
    npm(`Instalando dependencias del frontend ${frontend.name}`, ['ci', '--no-audit', '--no-fund'], frontend.directory);
    actions.push(`dependencias del frontend ${frontend.name}`);
  }
}

/** Devuelve la lista de cosas que tuvo que preparar. */
export function setup() {
  const actions = [];
  const errors = [];
  const steps = [
    () => setupRoot(actions),
    () => setupEnvironmentFiles(actions),
    () => setupNodeService('Gateway', servicePaths.gateway, actions),
    () => setupNodeService('Auth', servicePaths.auth, actions),
    () => setupKafkaBinding(actions),
    () => setupPurchases(actions),
    () => setupFrontends(actions),
  ];
  // Un paso fallido no impide preparar los demás; al final se informan todos.
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (actions.length > 0) console.log(`Preparado: ${actions.join(', ')}.`);
  if (errors.length > 0) throw new Error(errors.map((message) => `- ${message}`).join('\n'));
  if (actions.length === 0) console.log('Dependencias y configuración ya estaban listas.');
  return actions;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    setup();
  } catch (error) {
    console.error(`\nNo se pudo preparar todo:\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
