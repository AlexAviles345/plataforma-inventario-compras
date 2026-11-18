import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  REQUIRED_NODE_MAJOR,
  backendEndpoints,
  capture,
  frontendProjects,
  infrastructureServices,
  isWindows,
  jwtEnvironmentFiles,
  kafkaNativeBinding,
  nestBinary,
  nodeMajor,
  npmCommand,
  processOnPort,
  readEnvFile,
  servicePaths,
  venvPython,
} from './project.mjs';

/**
 * Diagnóstico de solo lectura: herramientas, Docker, dependencias,
 * configuración y puertos. No instala ni modifica nada.
 */

const ok = (label, detail) => ({ status: 'ok', label, detail });
const warn = (label, detail, fix) => ({ status: 'warn', label, detail, fix });
const fail = (label, detail, fix) => ({ status: 'fail', label, detail, fix });

function toolChecks() {
  const checks = [];

  checks.push(
    nodeMajor === REQUIRED_NODE_MAJOR
      ? ok('Node.js', process.versions.node)
      : warn(
          'Node.js',
          `${process.versions.node}; el proyecto usa ${REQUIRED_NODE_MAJOR}.x`,
          `instala Node ${REQUIRED_NODE_MAJOR} LTS. Con otra versión Auth no publica en Kafka y npm ci falla por engines`,
        ),
  );

  const npmVersion = capture(...npmCommand(['--version']));
  checks.push(
    npmVersion.ok && npmVersion.output.startsWith('11.')
      ? ok('npm', npmVersion.output)
      : warn('npm', npmVersion.output || 'no encontrado', 'usa npm 11.x (incluido con Node 24)'),
  );

  const javaCommand = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', isWindows ? 'java.exe' : 'java')
    : 'java';
  const java = capture(javaCommand, ['-version']);
  const javaMajor = Number(/version "(\d+)/.exec(java.output)?.[1] ?? 0);
  checks.push(
    javaMajor >= 21
      ? ok('Java (Inventory)', `JDK ${javaMajor}`)
      : fail(
          'Java (Inventory)',
          java.missing ? 'no encontrado' : `JDK ${javaMajor || 'desconocido'}`,
          'instala un JDK 21 o posterior y configura JAVA_HOME',
        ),
  );

  if (existsSync(venvPython())) {
    const python = capture(venvPython(), ['--version']);
    checks.push(
      python.ok && python.output.includes('3.14')
        ? ok('Python (Purchases)', `${python.output} en .venv`)
        : warn('Python (Purchases)', `${python.output} en .venv`, 'recrea .venv con Python 3.14'),
    );
  } else {
    const python = findPython();
    checks.push(
      python
        ? ok('Python (Purchases)', `${python.version} disponible para crear .venv`)
        : fail('Python (Purchases)', 'no se encontró Python 3.14', 'instala Python 3.14'),
    );
  }

  return checks;
}

/** Busca un intérprete Python 3.14 para crear el entorno virtual. */
export function findPython() {
  const candidates = isWindows
    ? [['py', ['-3.14']], ['python', []]]
    : [['python3.14', []], ['python3', []], ['python', []]];
  for (const [command, prefix] of candidates) {
    const result = capture(command, [...prefix, '--version']);
    if (result.ok && /Python 3\.14\b/.test(result.output)) {
      return { command, prefix, version: result.output };
    }
  }
  return undefined;
}

function dockerChecks() {
  const cli = capture('docker', ['--version']);
  if (cli.missing) {
    return [fail('Docker', 'no instalado', 'instala Docker Desktop')];
  }
  const daemon = capture('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (!daemon.ok) {
    return [
      ok('Docker CLI', cli.output.replace(/^Docker version /, '')),
      fail('Docker Engine', 'no responde', 'inicia Docker Desktop y espera a que diga "Engine running"'),
    ];
  }
  const compose = capture('docker', ['compose', 'version', '--short']);
  const composeMajor = Number(compose.output.replace(/^v/, '').split('.')[0]);
  return [
    ok('Docker Engine', daemon.output),
    composeMajor >= 2
      ? ok('Docker Compose', compose.output)
      : fail('Docker Compose', compose.output || 'no encontrado', 'actualiza Docker Desktop (Compose v2)'),
  ];
}

function dependencyChecks() {
  const checks = [
    existsSync(nestBinary(servicePaths.gateway))
      ? ok('Dependencias del Gateway')
      : fail('Dependencias del Gateway', 'faltan', 'npm run setup'),
    existsSync(nestBinary(servicePaths.auth))
      ? ok('Dependencias de Auth')
      : fail('Dependencias de Auth', 'faltan', 'npm run setup'),
    existsSync(path.join(servicePaths.inventory, isWindows ? 'mvnw.cmd' : 'mvnw'))
      ? ok('Maven Wrapper de Inventory')
      : fail('Maven Wrapper de Inventory', 'falta', 'restaura mvnw de apps/backend/inventory-service'),
    existsSync(venvPython())
      ? ok('Entorno virtual de Purchases')
      : fail('Entorno virtual de Purchases', 'falta .venv', 'npm run setup'),
  ];

  if (existsSync(nestBinary(servicePaths.auth))) {
    checks.push(
      existsSync(kafkaNativeBinding)
        ? ok('Binario de Kafka en Auth')
        : warn(
            'Binario de Kafka en Auth',
            'no instalado: Auth no publicará eventos (quedan en el outbox)',
            nodeMajor === REQUIRED_NODE_MAJOR
              ? 'npm run setup'
              : `instala Node ${REQUIRED_NODE_MAJOR} y ejecuta npm run setup`,
          ),
    );
  }

  for (const frontend of frontendProjects()) {
    if (!frontend.script) {
      checks.push(fail(`Frontend ${frontend.name}`, 'sin script "dev" ni "start:dev"', 'agrega uno a su package.json'));
    } else if (!existsSync(path.join(frontend.directory, 'node_modules'))) {
      checks.push(fail(`Dependencias del frontend ${frontend.name}`, 'faltan', 'npm run setup'));
    } else {
      checks.push(ok(`Frontend ${frontend.name}`));
    }
  }
  return checks;
}

const isPlaceholder = (value) => !value || /replace/i.test(value);

function configurationChecks() {
  const checks = [];
  const environments = jwtEnvironmentFiles.map((entry) => ({
    ...entry,
    values: readEnvFile(path.join(entry.directory, '.env')),
  }));

  for (const { label, values } of environments) {
    if (!values) {
      checks.push(fail(`.env de ${label}`, 'no existe', 'npm run setup'));
      continue;
    }
    const secret = values.JWT_SECRET;
    if (isPlaceholder(secret)) {
      checks.push(fail(`.env de ${label}`, 'JWT_SECRET es el valor de ejemplo', 'genera uno y cópialo igual en los tres .env'));
    } else if (Buffer.byteLength(secret, 'utf8') < 32) {
      checks.push(fail(`.env de ${label}`, 'JWT_SECRET tiene menos de 32 bytes', 'usa un secreto más largo en los tres .env'));
    } else {
      checks.push(ok(`.env de ${label}`));
    }
  }

  const present = environments.filter(({ values }) => values && !isPlaceholder(values.JWT_SECRET));
  if (present.length > 1) {
    for (const key of ['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE']) {
      const distinct = new Set(present.map(({ values }) => values[key] ?? ''));
      if (distinct.size > 1) {
        checks.push(
          fail(
            `${key} compartido`,
            `difiere entre ${present.map(({ label }) => label).join(', ')}`,
            `copia el ${key} del .env del Gateway en los demás; los tokens de Auth no serían válidos en otros servicios`,
          ),
        );
      }
    }
    if (checks.every((check) => !check.label.endsWith('compartido'))) {
      checks.push(ok('JWT compartido', 'mismo secreto, issuer y audience'));
    }
  }
  return checks;
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

async function applicationPortChecks() {
  return Promise.all(
    backendEndpoints.map(async ({ service, port }) =>
      (await portIsInUse(port))
        ? fail(
            `Puerto ${port} (${service})`,
            `ocupado por ${processOnPort(port) ?? 'otro proceso'}`,
            'detén la ejecución anterior con Ctrl+C o el proceso que lo usa',
          )
        : ok(`Puerto ${port} (${service})`, 'libre'),
    ),
  );
}

/** Un puerto de infraestructura vale si está libre o lo usa el contenedor esperado. */
async function infrastructurePortChecks(dockerReady) {
  return Promise.all(
    infrastructureServices.map(async ({ container, port, label }) => {
      if (!(await portIsInUse(port))) return ok(`Puerto ${port} (${label})`, 'libre');
      const owner = dockerReady
        ? capture('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}']).output
        : '';
      if (owner.split(/\r?\n/).includes(container)) {
        return ok(`Puerto ${port} (${label})`, `${container} ya en ejecución`);
      }
      if (owner) {
        return fail(
          `Puerto ${port} (${label})`,
          `ocupado por el contenedor ${owner}`,
          `detén ese contenedor: docker stop ${owner}`,
        );
      }
      const process_ = processOnPort(port);
      return fail(
        `Puerto ${port} (${label})`,
        `ocupado por ${process_ ?? 'otro proceso'}`,
        'detén ese programa o servicio local (Docker necesita el puerto)',
      );
    }),
  );
}

const colors = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (colors ? `\u001b[${code}m${text}\u001b[0m` : text);
const tags = {
  ok: paint(32, '  OK   '),
  warn: paint(33, ' AVISO '),
  fail: paint(31, ' FALLA '),
};

function printSection(title, checks) {
  console.log(`\n${title}`);
  for (const check of checks) {
    const detail = check.detail ? ` — ${check.detail}` : '';
    console.log(`${tags[check.status]} ${check.label}${detail}`);
    if (check.fix && check.status !== 'ok') console.log(`        → ${check.fix}`);
  }
}

/**
 * Ejecuta el diagnóstico y lo imprime. Devuelve true si no hay fallas.
 * `infrastructure`: comprueba Docker y los puertos de las bases y Kafka.
 * `applicationPorts`: comprueba que los puertos de los servicios estén libres.
 */
export async function runDoctor({ infrastructure = true, applicationPorts = true } = {}) {
  const sections = [['Herramientas', toolChecks()]];

  let dockerReady = false;
  if (infrastructure) {
    const docker = dockerChecks();
    dockerReady = docker.every((check) => check.status === 'ok');
    sections.push(['Docker', docker]);
  }
  sections.push(['Dependencias', dependencyChecks()]);
  sections.push(['Configuración', configurationChecks()]);

  const ports = [];
  if (applicationPorts) ports.push(...(await applicationPortChecks()));
  if (infrastructure) ports.push(...(await infrastructurePortChecks(dockerReady)));
  if (ports.length > 0) sections.push(['Puertos', ports]);

  for (const [title, checks] of sections) printSection(title, checks);

  const all = sections.flatMap(([, checks]) => checks);
  const failures = all.filter((check) => check.status === 'fail').length;
  const warnings = all.filter((check) => check.status === 'warn').length;
  console.log(
    failures > 0
      ? paint(31, `\n${failures} falla(s) y ${warnings} aviso(s). Corrige las fallas y vuelve a intentarlo.`)
      : paint(32, `\nTodo listo${warnings > 0 ? ` (${warnings} aviso(s))` : ''}.`),
  );
  return failures === 0;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const ready = await runDoctor({ infrastructure: !process.argv.includes('--no-infra') });
  process.exitCode = ready ? 0 : 1;
}
