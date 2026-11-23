import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as auditLog from '../src/audit/audit-log';
import { AppModule } from '../src/app.module';
import { AuthDomainError } from '../src/common/errors';
import { runWithRequestId } from '../src/common/request-context';
import { assertValidUserEvent, type UserEvent } from '../src/events/user-event';
import { PasswordHasher } from '../src/users/password-hasher';
import {
  UsersService,
  type CreateUserInput,
  type UserView,
} from '../src/users/users.service';

const ACTOR = { actorUserId: randomUUID() };
const PASSWORD = 'Inventario-Seguro-2026';

interface OutboxRow {
  event_type: string;
  entity_version: string;
  partition_key: string;
  aggregate_id: string;
  correlation_id: string;
  status: string;
  payload: UserEvent;
}

interface AuditRow {
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_key: string;
  target_version: string;
  request_id: string;
  details: Record<string, unknown>;
}

describe('UsersService (PostgreSQL)', () => {
  let app: INestApplication;
  let users: UsersService;
  let hasher: PasswordHasher;
  let dataSource: DataSource;

  const input = (
    overrides: Partial<CreateUserInput> = {},
  ): CreateUserInput => ({
    email: 'inventario@techdistribution.com',
    displayName: 'Gestor de inventario',
    password: PASSWORD,
    assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
    ...overrides,
  });

  const createAdmin = (email: string) =>
    users.createUser(
      input({
        email,
        displayName: email,
        assignments: [{ system: 'INVENTORY', role: 'ADMIN' }],
      }),
      ACTOR,
    );

  const outbox = () =>
    dataSource.query<OutboxRow[]>(
      'SELECT * FROM outbox_events ORDER BY aggregate_id, entity_version',
    );
  const audit = () =>
    dataSource.query<AuditRow[]>(
      'SELECT * FROM auth_audit_log ORDER BY created_at, target_version',
    );
  const count = async (table: string) => {
    const [{ total }] = await dataSource.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ${table}`,
    );
    return total;
  };

  const expectDomainError = async (
    promise: Promise<unknown>,
    statusCode: number,
    code: string,
  ) => {
    const error: unknown = await promise.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AuthDomainError);
    expect(error).toMatchObject({ statusCode, code });
    return error as AuthDomainError;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    users = app.get(UsersService);
    hasher = app.get(PasswordHasher);
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('createUser', () => {
    it('stores user, assignments, audit and UserCreated in one transaction', async () => {
      const requestId = randomUUID();
      const view = await runWithRequestId(requestId, () =>
        users.createUser(
          input({
            email: '  Inventario@TechDistribution.com ',
            displayName: '  Gestor de inventario ',
            assignments: [
              { system: 'PURCHASES', role: 'ADMIN' },
              { system: 'INVENTORY', role: 'INVENTORY_MANAGER' },
            ],
          }),
          ACTOR,
        ),
      );

      expect(view).toMatchObject({
        email: 'inventario@techdistribution.com',
        displayName: 'Gestor de inventario',
        active: true,
        version: 1,
        assignments: [
          { system: 'INVENTORY', role: 'INVENTORY_MANAGER' },
          { system: 'PURCHASES', role: 'ADMIN' },
        ],
      });
      expect(view).not.toHaveProperty('passwordHash');

      const [event] = await outbox();
      expect(event).toMatchObject({
        event_type: 'UserCreated',
        entity_version: '1',
        aggregate_id: view.id,
        partition_key: view.id,
        correlation_id: requestId,
        status: 'PENDING',
      });
      expect(() => assertValidUserEvent(event.payload)).not.toThrow();
      expect(event.payload).toMatchObject({
        aggregateId: view.id,
        entityVersion: 1,
        correlationId: requestId,
        data: {
          userId: view.id,
          email: view.email,
          displayName: view.displayName,
          active: true,
          assignments: view.assignments,
        },
      });

      const [entry] = await audit();
      expect(entry).toMatchObject({
        actor_user_id: ACTOR.actorUserId,
        action: 'USER_CREATED',
        target_type: 'USER',
        target_key: view.id,
        target_version: '1',
        request_id: requestId,
      });
    });

    it('stores an Argon2id hash that never leaves the database row', async () => {
      const view = await users.createUser(input(), ACTOR);
      const [{ password_hash: hash }] = await dataSource.query<
        { password_hash: string }[]
      >('SELECT password_hash FROM users WHERE id = $1', [view.id]);

      expect(hash).toMatch(/^\$argon2id\$/);
      await expect(hasher.verify(hash, PASSWORD)).resolves.toBe(true);
      const published = JSON.stringify([await outbox(), await audit()]);
      expect(published).not.toContain('argon2');
      expect(published).not.toContain(PASSWORD);
    });

    it('generates a correlation id outside HTTP', async () => {
      await users.createUser(input(), ACTOR);
      const [event] = await outbox();
      const [entry] = await audit();
      expect(event.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(entry.request_id).toBe(event.correlation_id);
    });

    it('rejects duplicate emails after normalization with 409', async () => {
      await users.createUser(input(), ACTOR);
      const error = await expectDomainError(
        users.createUser(
          input({ email: 'INVENTARIO@techdistribution.com ' }),
          ACTOR,
        ),
        409,
        'EMAIL_ALREADY_EXISTS',
      );
      expect(error.details).toEqual([
        expect.objectContaining({ field: 'email' }),
      ]);
      expect(await count('users')).toBe(1);
      expect(await count('outbox_events')).toBe(1);
    });

    it('validates every field before writing anything', async () => {
      const error = await expectDomainError(
        users.createUser(
          input({
            email: 'no-es-email',
            displayName: '   ',
            password: 'password',
            assignments: [{ system: 'INVENTORY', role: 'PURCHASES_AGENT' }],
          }),
          ACTOR,
        ),
        400,
        'VALIDATION_ERROR',
      );
      expect(error.details.map((detail) => detail.field)).toEqual([
        'email',
        'displayName',
        'password',
        'assignments[0].role',
      ]);
      expect(await count('users')).toBe(0);
    });

    it('rolls back the user when the audit or outbox write fails', async () => {
      jest
        .spyOn(auditLog, 'recordAudit')
        .mockRejectedValueOnce(new Error('fallo simulado'));
      await expect(users.createUser(input(), ACTOR)).rejects.toThrow(
        'fallo simulado',
      );
      expect(await count('users')).toBe(0);
      expect(await count('user_systems')).toBe(0);
      expect(await count('outbox_events')).toBe(0);
    });
  });

  describe('updateUser', () => {
    let user: UserView;

    beforeEach(async () => {
      await createAdmin('admin@techdistribution.com');
      user = await users.createUser(input(), ACTOR);
    });

    const eventsFor = async (id: string) =>
      (await outbox()).filter((row) => row.aggregate_id === id);

    it('applies public changes, bumps the version and publishes UserUpdated', async () => {
      const updated = await users.updateUser(
        user.id,
        { expectedVersion: 1, displayName: ' Nuevo nombre ' },
        ACTOR,
      );
      expect(updated).toMatchObject({
        displayName: 'Nuevo nombre',
        version: 2,
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        user.updatedAt.getTime(),
      );

      const events = await eventsFor(user.id);
      expect(events.map((e) => [e.event_type, e.entity_version])).toEqual([
        ['UserCreated', '1'],
        ['UserUpdated', '2'],
      ]);
      expect(events[1].payload.data.displayName).toBe('Nuevo nombre');
      expect((await audit()).at(-1)).toMatchObject({
        action: 'USER_UPDATED',
        target_version: '2',
        details: { changes: ['displayName'] },
      });
    });

    it('rejects a stale expectedVersion with 409 VERSION_CONFLICT', async () => {
      await users.updateUser(
        user.id,
        { expectedVersion: 1, active: false },
        ACTOR,
      );
      await expectDomainError(
        users.updateUser(user.id, { expectedVersion: 1, active: true }, ACTOR),
        409,
        'VERSION_CONFLICT',
      );
    });

    it.each([randomUUID(), 'no-es-uuid'])(
      'returns 404 for unknown user %p',
      async (id) => {
        await expectDomainError(
          users.updateUser(id, { expectedVersion: 1, active: false }, ACTOR),
          404,
          'RESOURCE_NOT_FOUND',
        );
      },
    );

    it('does not write anything when nothing changes', async () => {
      const result = await users.updateUser(
        user.id,
        {
          expectedVersion: 1,
          email: 'INVENTARIO@techdistribution.com',
          active: true,
          assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
        },
        ACTOR,
      );
      expect(result.version).toBe(1);
      expect(await eventsFor(user.id)).toHaveLength(1);
      expect(await count('auth_audit_log')).toBe(2);
    });

    it('changes the password without publishing an event', async () => {
      const result = await users.updateUser(
        user.id,
        { expectedVersion: 1, password: 'Otra-Clave-Larga-99' },
        ACTOR,
      );
      expect(result.version).toBe(2);
      expect(await eventsFor(user.id)).toHaveLength(1);
      expect((await audit()).at(-1)).toMatchObject({
        target_version: '2',
        details: { changes: ['password'] },
      });
      const [{ password_hash: hash }] = await dataSource.query<
        { password_hash: string }[]
      >('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      await expect(hasher.verify(hash, 'Otra-Clave-Larga-99')).resolves.toBe(
        true,
      );
      await expect(hasher.verify(hash, PASSWORD)).resolves.toBe(false);
    });

    it('replaces assignments: adds, changes roles and removes', async () => {
      const added = await users.updateUser(
        user.id,
        {
          expectedVersion: 1,
          assignments: [
            { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
            { system: 'INVENTORY', role: 'ADMIN' },
          ],
        },
        ACTOR,
      );
      expect(added.assignments).toEqual([
        { system: 'INVENTORY', role: 'ADMIN' },
        { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
      ]);

      const removed = await users.updateUser(
        user.id,
        {
          expectedVersion: 2,
          assignments: [{ system: 'PURCHASES', role: 'PURCHASES_AGENT' }],
        },
        ACTOR,
      );
      expect(removed).toMatchObject({
        version: 3,
        assignments: [{ system: 'PURCHASES', role: 'PURCHASES_AGENT' }],
      });
      const rows = await dataSource.query<{ system_code: string }[]>(
        'SELECT system_code FROM user_systems WHERE user_id = $1',
        [user.id],
      );
      expect(rows).toEqual([{ system_code: 'PURCHASES' }]);
      const events = await eventsFor(user.id);
      expect(events.at(-1)?.payload.data.assignments).toEqual(
        removed.assignments,
      );
    });

    it('rejects changing the email to one already in use', async () => {
      await expectDomainError(
        users.updateUser(
          user.id,
          { expectedVersion: 1, email: 'Admin@TechDistribution.com' },
          ACTOR,
        ),
        409,
        'EMAIL_ALREADY_EXISTS',
      );
    });

    it('validates expectedVersion and provided fields', async () => {
      const error = await expectDomainError(
        users.updateUser(
          user.id,
          { expectedVersion: 0, password: 'corta' },
          ACTOR,
        ),
        400,
        'VALIDATION_ERROR',
      );
      expect(error.details.map((detail) => detail.field)).toEqual([
        'expectedVersion',
        'password',
      ]);
    });

    it('forbids an admin from modifying their own user account', async () => {
      const selfAdmin = await users.createUser(
        input({
          email: 'self-admin@techdistribution.com',
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'ADMIN' },
          ],
        }),
        ACTOR,
      );

      await expectDomainError(
        users.updateUser(
          selfAdmin.id,
          {
            expectedVersion: 1,
            assignments: [{ system: 'INVENTORY', role: 'ADMIN' }],
          },
          { actorUserId: selfAdmin.id },
        ),
        403,
        'FORBIDDEN',
      );

      await expectDomainError(
        users.updateUser(
          selfAdmin.id,
          { expectedVersion: 1, displayName: 'Intento propio' },
          { actorUserId: selfAdmin.id },
        ),
        403,
        'FORBIDDEN',
      );
    });
  });

  describe('last active ADMIN protection', () => {
    it('refuses to deactivate or demote the only active ADMIN', async () => {
      const admin = await createAdmin('admin@techdistribution.com');
      await expectDomainError(
        users.updateUser(
          admin.id,
          { expectedVersion: 1, active: false },
          ACTOR,
        ),
        409,
        'LAST_ACTIVE_ADMIN',
      );
      await expectDomainError(
        users.updateUser(
          admin.id,
          {
            expectedVersion: 1,
            assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
          },
          ACTOR,
        ),
        409,
        'LAST_ACTIVE_ADMIN',
      );
      expect((await users.findById(admin.id)).version).toBe(1);
    });

    it('ignores inactive admins when counting', async () => {
      const first = await createAdmin('uno@techdistribution.com');
      const second = await createAdmin('dos@techdistribution.com');
      await users.updateUser(
        second.id,
        { expectedVersion: 1, active: false },
        ACTOR,
      );
      await expectDomainError(
        users.updateUser(
          first.id,
          { expectedVersion: 1, active: false },
          ACTOR,
        ),
        409,
        'LAST_ACTIVE_ADMIN',
      );
    });

    it('lets an admin with the role on another system be demoted on one', async () => {
      const admin = await users.createUser(
        input({
          email: 'doble@techdistribution.com',
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'ADMIN' },
          ],
        }),
        ACTOR,
      );
      await expect(
        users.updateUser(
          admin.id,
          {
            expectedVersion: 1,
            assignments: [
              { system: 'INVENTORY', role: 'INVENTORY_MANAGER' },
              { system: 'PURCHASES', role: 'ADMIN' },
            ],
          },
          ACTOR,
        ),
      ).resolves.toMatchObject({ version: 2 });
    });

    it('keeps one active ADMIN when two admins deactivate each other concurrently', async () => {
      const first = await createAdmin('uno@techdistribution.com');
      const second = await createAdmin('dos@techdistribution.com');

      const results = await Promise.allSettled([
        users.updateUser(
          first.id,
          { expectedVersion: 1, active: false },
          ACTOR,
        ),
        users.updateUser(
          second.id,
          { expectedVersion: 1, active: false },
          ACTOR,
        ),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const [rejected] = results.filter((r) => r.status === 'rejected');
      expect(rejected.reason).toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
      const [{ total }] = await dataSource.query<{ total: number }[]>(
        `SELECT count(DISTINCT u.id)::int AS total FROM users u
         JOIN user_systems us ON us.user_id = u.id
         WHERE u.active AND us.role = 'ADMIN'`,
      );
      expect(total).toBe(1);
    });

    it('serializes concurrent updates of the same user by version', async () => {
      await createAdmin('admin@techdistribution.com');
      const user = await users.createUser(input(), ACTOR);
      const results = await Promise.allSettled([
        users.updateUser(
          user.id,
          { expectedVersion: 1, displayName: 'A' },
          ACTOR,
        ),
        users.updateUser(
          user.id,
          { expectedVersion: 1, displayName: 'B' },
          ACTOR,
        ),
      ]);
      const codes = results.map((r) =>
        r.status === 'fulfilled' ? 'OK' : (r.reason as AuthDomainError).code,
      );
      expect(codes.sort()).toEqual(['OK', 'VERSION_CONFLICT']);
      expect((await users.findById(user.id)).version).toBe(2);
    });
  });
});
