import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  BOOTSTRAP_EMAIL_VAR,
  BOOTSTRAP_NAME_VAR,
  runBootstrapAdmin,
} from '../src/cli/bootstrap-admin';
import { AuthDomainError } from '../src/common/errors';
import { UsersService } from '../src/users/users.service';

const PASSWORD = 'Bootstrap-Seguro-2026';
const ADMIN = {
  email: 'Root@TechDistribution.com',
  displayName: 'Administrador inicial',
  password: PASSWORD,
};

describe('Admin bootstrap', () => {
  let app: INestApplication;
  let users: UsersService;
  let dataSource: DataSource;

  const count = async (table: string) => {
    const [{ total }] = await dataSource.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ${table}`,
    );
    return total;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    users = app.get(UsersService);
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('UsersService.bootstrapAdmin', () => {
    it('creates an ADMIN on both systems with audit and UserCreated', async () => {
      const result = await users.bootstrapAdmin(ADMIN);
      expect(result).toMatchObject({
        created: true,
        user: {
          email: 'root@techdistribution.com',
          active: true,
          version: 1,
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'ADMIN' },
          ],
        },
      });

      const [audit] = await dataSource.query<Record<string, unknown>[]>(
        'SELECT actor_user_id, action, details FROM auth_audit_log',
      );
      expect(audit).toMatchObject({
        actor_user_id: null,
        action: 'BOOTSTRAP_ADMIN',
        details: { source: 'cli' },
      });
      const [event] = await dataSource.query<Record<string, unknown>[]>(
        'SELECT event_type, entity_version FROM outbox_events',
      );
      expect(event).toEqual({ event_type: 'UserCreated', entity_version: '1' });
      const written = JSON.stringify(
        await dataSource.query(
          'SELECT a.details, o.payload FROM auth_audit_log a, outbox_events o',
        ),
      );
      expect(written).not.toContain(PASSWORD);
      expect(written).not.toContain('argon2');
    });

    it('is idempotent: a second run changes nothing', async () => {
      await users.bootstrapAdmin(ADMIN);
      await expect(
        users.bootstrapAdmin({ ...ADMIN, email: 'otro@techdistribution.com' }),
      ).resolves.toEqual({ created: false });
      expect(await count('users')).toBe(1);
      expect(await count('auth_audit_log')).toBe(1);
      expect(await count('outbox_events')).toBe(1);
    });

    it('never reactivates an inactive admin; creates a new one instead', async () => {
      const first = await users.bootstrapAdmin(ADMIN);
      if (!first.created) throw new Error('bootstrap inicial no creado');
      await dataSource.query('UPDATE users SET active = false WHERE id = $1', [
        first.user.id,
      ]);

      await expect(users.bootstrapAdmin(ADMIN)).rejects.toMatchObject({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
      });
      const [{ active }] = await dataSource.query<{ active: boolean }[]>(
        'SELECT active FROM users WHERE id = $1',
        [first.user.id],
      );
      expect(active).toBe(false);

      await expect(
        users.bootstrapAdmin({ ...ADMIN, email: 'nuevo@techdistribution.com' }),
      ).resolves.toMatchObject({ created: true });
    });

    it('does not promote an existing non-admin user with the same email', async () => {
      await users.createUser(
        {
          ...ADMIN,
          assignments: [{ system: 'PURCHASES', role: 'PURCHASES_AGENT' }],
        },
        { actorUserId: null },
      );
      await expect(users.bootstrapAdmin(ADMIN)).rejects.toBeInstanceOf(
        AuthDomainError,
      );
      const roles = await dataSource.query<{ role: string }[]>(
        'SELECT role FROM user_systems',
      );
      expect(roles).toEqual([{ role: 'PURCHASES_AGENT' }]);
    });

    it('validates the input before touching the database', async () => {
      await expect(
        users.bootstrapAdmin({ ...ADMIN, password: 'password123' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(await count('users')).toBe(0);
    });

    it('creates a single admin when two bootstraps run concurrently', async () => {
      const results = await Promise.all([
        users.bootstrapAdmin({ ...ADMIN, email: 'uno@techdistribution.com' }),
        users.bootstrapAdmin({ ...ADMIN, email: 'dos@techdistribution.com' }),
      ]);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(await count('users')).toBe(1);
    });
  });

  describe('runBootstrapAdmin', () => {
    const run = (env: NodeJS.ProcessEnv, password = PASSWORD) => {
      const out: string[] = [];
      const err: string[] = [];
      const readPassword = jest.fn(() => Promise.resolve(password));
      const code = runBootstrapAdmin({
        env,
        users,
        readPassword,
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      });
      return { code, out, err, readPassword };
    };
    const env = {
      [BOOTSTRAP_EMAIL_VAR]: ADMIN.email,
      [BOOTSTRAP_NAME_VAR]: ADMIN.displayName,
    };

    it('requires both variables and never asks for the password otherwise', async () => {
      const result = run({ [BOOTSTRAP_EMAIL_VAR]: ADMIN.email });
      await expect(result.code).resolves.toBe(1);
      expect(result.err.join('\n')).toContain(BOOTSTRAP_NAME_VAR);
      expect(result.readPassword).not.toHaveBeenCalled();
    });

    it('creates the admin, then exits 0 without prompting on later runs', async () => {
      const first = run(env);
      await expect(first.code).resolves.toBe(0);
      expect(first.out.join('\n')).toMatch(
        /Administrador creado: root@techdistribution\.com/,
      );

      const second = run(env);
      await expect(second.code).resolves.toBe(0);
      expect(second.out.join('\n')).toContain('Ya existe un administrador');
      expect(second.readPassword).not.toHaveBeenCalled();
    });

    it('reports validation details without echoing the password', async () => {
      const result = run(env, 'password123');
      await expect(result.code).resolves.toBe(1);
      const printed = [...result.out, ...result.err].join('\n');
      expect(printed).toContain('password:');
      expect(printed).not.toContain('password123');
    });
  });

  describe('CLI process', () => {
    it('reads the password from a pipe and creates the admin', async () => {
      const cli = join(__dirname, '../src/cli/bootstrap-admin.ts');
      const child = spawn(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', cli],
        {
          cwd: join(__dirname, '..'),
          env: {
            ...process.env,
            [BOOTSTRAP_EMAIL_VAR]: 'cli@techdistribution.com',
            [BOOTSTRAP_NAME_VAR]: 'Administrador CLI',
          },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.stdin.end(`${PASSWORD}\n`);
      const code = await new Promise<number | null>((resolve) =>
        child.on('close', resolve),
      );

      expect({ code, stderr }).toMatchObject({ code: 0 });
      expect(stdout).toContain(
        'Administrador creado: cli@techdistribution.com',
      );
      expect(stdout + stderr).not.toContain(PASSWORD);
    }, 30_000);
  });
});
