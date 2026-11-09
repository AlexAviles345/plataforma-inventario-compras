import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolsDirectory, '..');
const composeFile = path.join(repositoryRoot, 'docker-compose.example.yml');
const composeArguments = ['compose', '-f', composeFile];

function runDocker(arguments_) {
  const result = spawnSync('docker', arguments_, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw new Error(
      `No se pudo ejecutar Docker: ${result.error.message}. ` +
        'Comprueba que Docker Desktop esté instalado e iniciado.',
    );
  }
  if (result.status !== 0) {
    throw new Error(`Docker terminó con código ${result.status ?? 'desconocido'}`);
  }
}

export function startInfrastructure() {
  console.log('Iniciando PostgreSQL, MySQL y Kafka...');
  runDocker([
    ...composeArguments,
    'up',
    '-d',
    '--wait',
    'postgres-auth',
    'postgres-purchases',
    'mysql-inventory',
    'kafka',
  ]);
  runDocker([...composeArguments, 'run', '--rm', 'kafka-init']);
  console.log('Infraestructura lista.');
}

export function stopInfrastructure() {
  runDocker([...composeArguments, 'down', '--remove-orphans']);
  console.log('Infraestructura detenida; los volúmenes se conservaron.');
}

export function showInfrastructureStatus() {
  runDocker([...composeArguments, 'ps']);
}

export function showInfrastructureLogs() {
  runDocker([...composeArguments, 'logs', '--tail=100', '--follow']);
}

function printUsage() {
  console.error('Uso: node tools/infra.mjs <up|down|status|logs>');
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    switch (process.argv[2]) {
      case 'up':
        startInfrastructure();
        break;
      case 'down':
        stopInfrastructure();
        break;
      case 'status':
        showInfrastructureStatus();
        break;
      case 'logs':
        showInfrastructureLogs();
        break;
      default:
        printUsage();
        process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
