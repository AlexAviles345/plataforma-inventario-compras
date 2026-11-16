import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { validateDatabaseEnvironment } from '../src/config/environment';
import {
  buildDataSourceOptions,
  databaseSettings,
  MIGRATIONS,
} from '../src/database/database-options';

describe('Auth PostgreSQL schema', () => {
  let dataSource: DataSource;

  const insertUser = (email = 'admin@techdistribution.com', name = 'Admin') =>
    dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, 'argon2-hash') RETURNING id`,
      [email, name],
    );

  const insertOutbox = (overrides: Record<string, unknown> = {}) => {
    const aggregateId = randomUUID();
    const row = {
      event_id: randomUUID(),
      aggregate_type: 'USER',
      aggregate_id: aggregateId,
      event_type: 'UserCreated',
      schema_version: 1,
      entity_version: 1,
      topic: 'auth.users.events',
      partition_key: aggregateId,
      payload: '{}',
      correlation_id: randomUUID(),
      occurred_at: new Date(),
      ...overrides,
    };
    const columns = Object.keys(row);
    return dataSource.query(
      `INSERT INTO outbox_events (${columns.join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  beforeAll(async () => {
    dataSource = new DataSource(
      buildDataSourceOptions(
        databaseSettings(validateDatabaseEnvironment(process.env)),
      ),
    );
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('applies every migration', async () => {
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('keeps entities and migrations in sync', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('seeds exactly the two systems with a 900 second TTL', async () => {
    await expect(
      dataSource.query(
        'SELECT code, access_token_ttl_seconds, version FROM systems ORDER BY code',
      ),
    ).resolves.toEqual([
      { code: 'INVENTORY', access_token_ttl_seconds: 900, version: '1' },
      { code: 'PURCHASES', access_token_ttl_seconds: 900, version: '1' },
    ]);
  });

  describe('users', () => {
    it('stores normalized users with defaults', async () => {
      const [{ id }] = await insertUser();
      const [user] = await dataSource.query<Record<string, unknown>[]>(
        'SELECT active, version FROM users WHERE id = $1',
        [id],
      );
      expect(user).toEqual({ active: true, version: '1' });
    });

    it.each([
      ['uppercase email', 'Admin@TechDistribution.com', 'Admin'],
      ['email with spaces', ' admin@techdistribution.com', 'Admin'],
      ['untrimmed display name', 'a@b.com', ' Admin '],
      ['empty display name', 'a@b.com', ''],
    ])('rejects %s', async (_case, email, name) => {
      await expect(insertUser(email, name)).rejects.toThrow(/ck_users_/);
    });

    it('rejects duplicate emails', async () => {
      await insertUser();
      await expect(insertUser()).rejects.toThrow(/uq_users_email/);
    });
  });

  describe('user_systems', () => {
    const assign = (userId: string, system: string, role: string) =>
      dataSource.query(
        'INSERT INTO user_systems (user_id, system_code, role) VALUES ($1, $2, $3)',
        [userId, system, role],
      );

    it.each([
      ['INVENTORY', 'ADMIN'],
      ['INVENTORY', 'INVENTORY_MANAGER'],
      ['PURCHASES', 'ADMIN'],
      ['PURCHASES', 'PURCHASES_AGENT'],
    ])('accepts %s / %s', async (system, role) => {
      const [{ id }] = await insertUser();
      await expect(assign(id, system, role)).resolves.toBeDefined();
    });

    it.each([
      ['INVENTORY', 'PURCHASES_AGENT'],
      ['PURCHASES', 'INVENTORY_MANAGER'],
      ['INVENTORY', 'SUPERUSER'],
    ])('rejects %s / %s', async (system, role) => {
      const [{ id }] = await insertUser();
      await expect(assign(id, system, role)).rejects.toThrow(
        /ck_user_systems_role/,
      );
    });

    it('allows a single assignment per system', async () => {
      const [{ id }] = await insertUser();
      await assign(id, 'INVENTORY', 'ADMIN');
      await expect(
        assign(id, 'INVENTORY', 'INVENTORY_MANAGER'),
      ).rejects.toThrow(/uq_user_systems_user_system/);
    });

    it('rejects unknown users and systems', async () => {
      await expect(assign(randomUUID(), 'INVENTORY', 'ADMIN')).rejects.toThrow(
        /fk_user_systems_user/,
      );
      const [{ id }] = await insertUser();
      await expect(assign(id, 'BILLING', 'ADMIN')).rejects.toThrow(
        /fk_user_systems_system|ck_user_systems_role/,
      );
    });

    it('prevents deleting a user that has assignments', async () => {
      const [{ id }] = await insertUser();
      await assign(id, 'PURCHASES', 'PURCHASES_AGENT');
      await expect(
        dataSource.query('DELETE FROM users WHERE id = $1', [id]),
      ).rejects.toThrow(/fk_user_systems_user/);
    });
  });

  describe('auth_audit_log', () => {
    const audit = () =>
      dataSource.query<{ id: string }[]>(
        `INSERT INTO auth_audit_log (action, target_type, details)
         VALUES ('BOOTSTRAP_ADMIN', 'USER', '{"source":"cli"}') RETURNING id`,
      );

    it('is append-only', async () => {
      const [{ id }] = await audit();
      await expect(
        dataSource.query(
          `UPDATE auth_audit_log SET action = 'X' WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        dataSource.query('DELETE FROM auth_audit_log WHERE id = $1', [id]),
      ).rejects.toThrow(/append-only/);
    });

    it('only accepts JSON objects as details', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO auth_audit_log (action, target_type, details)
           VALUES ('X', 'USER', '[]')`,
        ),
      ).rejects.toThrow(/ck_auth_audit_log_details/);
    });
  });

  describe('outbox_events', () => {
    it('defaults new events to PENDING with no attempts', async () => {
      await insertOutbox();
      await expect(
        dataSource.query('SELECT status, attempt_count FROM outbox_events'),
      ).resolves.toEqual([{ status: 'PENDING', attempt_count: 0 }]);
    });

    it('allows one event per aggregate version', async () => {
      const aggregateId = randomUUID();
      const event = { aggregate_id: aggregateId, partition_key: aggregateId };
      await insertOutbox(event);
      await expect(insertOutbox(event)).rejects.toThrow(
        /uq_outbox_events_aggregate_version/,
      );
    });

    it.each<[string, Record<string, unknown>, RegExp]>([
      [
        'a key different from the aggregate',
        { partition_key: randomUUID() },
        /ck_outbox_events_partition_key/,
      ],
      [
        'PUBLISHED without published_at',
        { status: 'PUBLISHED' },
        /ck_outbox_events_published_at/,
      ],
      [
        'published_at while PENDING',
        { published_at: new Date() },
        /ck_outbox_events_published_at/,
      ],
      [
        'PUBLISHING without a lease',
        { status: 'PUBLISHING' },
        /ck_outbox_events_lease/,
      ],
      [
        'a lease without owner',
        { locked_at: new Date() },
        /ck_outbox_events_lease/,
      ],
      [
        'an unknown event type',
        { event_type: 'ProductCreated' },
        /ck_outbox_events_event_type/,
      ],
      ['a non-object payload', { payload: '[]' }, /ck_outbox_events_payload/],
    ])('rejects %s', async (_case, overrides, constraint) => {
      await expect(insertOutbox(overrides)).rejects.toThrow(constraint);
    });
  });

  it('reverts and reapplies every migration', async () => {
    for (let index = 0; index < MIGRATIONS.length; index++)
      await dataSource.undoLastMigration({ transaction: 'each' });
    await expect(
      dataSource.query(
        `SELECT count(*)::int AS tables FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name <> 'typeorm_migrations'`,
      ),
    ).resolves.toEqual([{ tables: 0 }]);

    const applied = await dataSource.runMigrations({ transaction: 'each' });
    expect(applied).toHaveLength(MIGRATIONS.length);
  });
});
