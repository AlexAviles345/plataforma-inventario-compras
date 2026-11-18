import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { OutboxPublisher } from '../src/outbox/outbox-publisher';
import {
  OUTBOX_TRANSPORT,
  type OutboxMessage,
  type OutboxTransport,
} from '../src/outbox/outbox-transport';
import { UsersService, type UserView } from '../src/users/users.service';

/** Broker simulado: registra envíos y permite forzar fallos o pausas. */
class FakeTransport implements OutboxTransport {
  sent: OutboxMessage[] = [];
  failWith?: Error;
  beforeAck?: (message: OutboxMessage) => Promise<void>;
  connect = jest.fn(() => Promise.resolve());
  disconnect = jest.fn(() => Promise.resolve());

  async send(message: OutboxMessage): Promise<void> {
    await this.beforeAck?.(message);
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}

interface Row {
  event_id: string;
  aggregate_id: string;
  entity_version: string;
  status: string;
  attempt_count: number;
  locked_by: string | null;
  locked_at: Date | null;
  published_at: Date | null;
  next_attempt_at: Date;
  last_error: string | null;
}

describe('OutboxPublisher (PostgreSQL)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let users: UsersService;
  let publisher: OutboxPublisher;
  const transport = new FakeTransport();

  const rows = () =>
    dataSource.query<Row[]>(
      'SELECT * FROM outbox_events ORDER BY aggregate_id, entity_version',
    );

  const createUser = (email: string) =>
    users.createUser(
      {
        email,
        displayName: email,
        password: 'Outbox-Seguro-2026',
        assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
      },
      { actorUserId: null },
    );

  const rename = (user: UserView, version: number, name: string) =>
    users.updateUser(
      user.id,
      { expectedVersion: version, displayName: name },
      { actorUserId: null },
    );

  const sentVersions = () =>
    transport.sent.map((message) => {
      const event = JSON.parse(message.value) as {
        aggregateId: string;
        entityVersion: number;
      };
      return `${event.aggregateId.slice(0, 8)}@${event.entityVersion}`;
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OUTBOX_TRANSPORT)
      .useValue(transport)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    users = app.get(UsersService);
    publisher = app.get(OutboxPublisher);
  });

  afterEach(async () => {
    await publisher.stop();
    transport.sent = [];
    transport.failWith = undefined;
    transport.beforeAck = undefined;
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('does not start in tests because OUTBOX_PUBLISHER_ENABLED=false', () => {
    expect(transport.connect).not.toHaveBeenCalled();
  });

  it('publishes the full event keyed by the aggregate and marks it PUBLISHED', async () => {
    const user = await createUser('uno@techdistribution.com');
    const [pending] = await rows();

    await expect(publisher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });

    expect(transport.sent).toHaveLength(1);
    const [message] = transport.sent;
    expect(message.topic).toBe('auth.users.events');
    expect(message.key).toBe(user.id);
    const event = JSON.parse(message.value) as Record<string, unknown>;
    expect(event).toMatchObject({
      eventId: pending.event_id,
      eventType: 'UserCreated',
      aggregateId: user.id,
      entityVersion: 1,
    });

    const [published] = await rows();
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      attempt_count: 1,
      locked_by: null,
      locked_at: null,
      last_error: null,
    });
    expect(published.published_at).toBeInstanceOf(Date);
    await expect(publisher.dispatchOnce()).resolves.toMatchObject({
      claimed: 0,
    });
  });

  it('keeps one event in flight per aggregate, in version order', async () => {
    const a = await createUser('a@techdistribution.com');
    const b = await createUser('b@techdistribution.com');
    await rename(a, 1, 'A2').then((v) => rename(v, 2, 'A3'));

    await publisher.dispatchOnce();
    // Primera ronda: solo la cabeza de cada agregado.
    expect(sentVersions().sort()).toEqual(
      [`${a.id.slice(0, 8)}@1`, `${b.id.slice(0, 8)}@1`].sort(),
    );

    await publisher.dispatchOnce();
    await publisher.dispatchOnce();
    const ofA = sentVersions().filter((v) => v.startsWith(a.id.slice(0, 8)));
    expect(ofA).toEqual([1, 2, 3].map((n) => `${a.id.slice(0, 8)}@${n}`));
    expect((await rows()).every((row) => row.status === 'PUBLISHED')).toBe(
      true,
    );
  });

  it('reschedules failures with backoff and never skips to the next version', async () => {
    const user = await createUser('falla@techdistribution.com');
    await rename(user, 1, 'Nuevo nombre');
    transport.failWith = new Error(
      'Local: Message timed out\n  at broker localhost:9092',
    );

    const before = Date.now();
    await expect(publisher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      published: 0,
      failed: 1,
    });
    const [head, next] = await rows();
    expect(head).toMatchObject({
      entity_version: '1',
      status: 'PENDING',
      attempt_count: 1,
      locked_by: null,
      last_error: 'Error: Local: Message timed out at broker localhost:9092',
    });
    expect(head.next_attempt_at.getTime()).toBeGreaterThanOrEqual(before + 400);
    expect(next).toMatchObject({ status: 'PENDING', attempt_count: 0 });

    // Durante el backoff no se reclama nada: ni v1 ni la v2 que va detrás.
    transport.failWith = undefined;
    await expect(publisher.dispatchOnce()).resolves.toMatchObject({
      claimed: 0,
    });

    await dataSource.query(
      `UPDATE outbox_events SET next_attempt_at = now() - interval '1 second'`,
    );
    await publisher.dispatchOnce();
    await publisher.dispatchOnce();
    expect(sentVersions()).toEqual([
      `${user.id.slice(0, 8)}@1`,
      `${user.id.slice(0, 8)}@2`,
    ]);
    const [retried] = await rows();
    expect(retried).toMatchObject({
      status: 'PUBLISHED',
      attempt_count: 2,
      last_error: null,
    });
  });

  it('never stores the payload in last_error', async () => {
    await createUser('secreto@techdistribution.com');
    const [{ payload }] = await dataSource.query<{ payload: object }[]>(
      'SELECT payload FROM outbox_events',
    );
    transport.failWith = new Error('x'.repeat(5000));
    await publisher.dispatchOnce();
    const [row] = await rows();
    expect(row.last_error?.length).toBe(1000);
    expect(row.last_error).not.toContain(JSON.stringify(payload));
  });

  it('recovers an expired lease left by a crashed worker', async () => {
    await createUser('lease@techdistribution.com');
    await dataSource.query(
      `UPDATE outbox_events
          SET status = 'PUBLISHING', locked_by = 'worker-caido',
              locked_at = now() - interval '2 minutes', attempt_count = 1`,
    );
    await expect(publisher.dispatchOnce()).resolves.toMatchObject({
      published: 1,
    });
    const [row] = await rows();
    expect(row).toMatchObject({ status: 'PUBLISHED', attempt_count: 2 });
  });

  it('does not touch a live lease held by another worker', async () => {
    await createUser('vivo@techdistribution.com');
    await dataSource.query(
      `UPDATE outbox_events
          SET status = 'PUBLISHING', locked_by = 'otro-worker', locked_at = now()`,
    );
    await expect(publisher.dispatchOnce()).resolves.toMatchObject({
      claimed: 0,
    });
    expect(transport.sent).toHaveLength(0);
  });

  it('does not mark as published after losing the lease', async () => {
    await createUser('fencing@techdistribution.com');
    transport.beforeAck = async () => {
      // Mientras esperamos el ack, otro worker reclama el lease vencido.
      await dataSource.query(
        `UPDATE outbox_events SET locked_by = 'otro-worker', locked_at = now()`,
      );
    };
    await publisher.dispatchOnce();
    const [row] = await rows();
    expect(row).toMatchObject({
      status: 'PUBLISHING',
      locked_by: 'otro-worker',
    });
  });

  it('sends each event once when two publishers race', async () => {
    for (const name of ['p1', 'p2', 'p3', 'p4', 'p5'])
      await createUser(`${name}@techdistribution.com`);
    const other = new OutboxPublisher(
      dataSource,
      transport,
      app.get(ConfigService),
    );

    await Promise.all([publisher.dispatchOnce(), other.dispatchOnce()]);
    expect(transport.sent).toHaveLength(5);
    expect(new Set(transport.sent.map((m) => m.key)).size).toBe(5);
  });

  it('purges published rows older than 30 days only', async () => {
    for (const name of ['viejo', 'reciente', 'pendiente'])
      await createUser(`${name}@techdistribution.com`);
    await dataSource.query(
      `UPDATE outbox_events o
          SET status = 'PUBLISHED',
              published_at = now() - CASE u.email
                WHEN 'viejo@techdistribution.com' THEN interval '31 days'
                ELSE interval '29 days' END
         FROM users u
        WHERE u.id = o.aggregate_id AND u.email <> 'pendiente@techdistribution.com'`,
    );
    await dataSource.query(
      `UPDATE outbox_events SET created_at = now() - interval '60 days'`,
    );

    await expect(publisher.purgePublished()).resolves.toBe(1);
    const remaining = await dataSource.query<{ email: string }[]>(
      `SELECT u.email FROM outbox_events o JOIN users u ON u.id = o.aggregate_id
        ORDER BY u.email`,
    );
    expect(remaining.map((r) => r.email)).toEqual([
      'pendiente@techdistribution.com',
      'reciente@techdistribution.com',
    ]);
  });

  const waitUntil = async (predicate: () => boolean, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
  };

  it('runs on its own once started and stops cleanly', async () => {
    transport.connect.mockClear();
    transport.disconnect.mockClear();
    publisher.start();
    await createUser('automatico@techdistribution.com');

    await waitUntil(() => transport.sent.length === 1);
    expect(transport.sent).toHaveLength(1);
    expect(transport.connect).toHaveBeenCalledTimes(1);

    await publisher.stop();
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps events pending without spending attempts while Kafka cannot connect', async () => {
    transport.connect.mockClear();
    transport.connect.mockRejectedValueOnce(new Error('Kafka no respondió'));
    await createUser('sin-broker@techdistribution.com');

    publisher.start();
    await waitUntil(() => transport.connect.mock.calls.length >= 1);
    const [waiting] = await rows();
    expect(waiting).toMatchObject({ status: 'PENDING', attempt_count: 0 });
    expect(publisher.isConnected).toBe(false);

    // Un intento posterior de conexión (tras el backoff) funciona y entrega.
    await waitUntil(() => transport.sent.length === 1, 10_000);
    expect(transport.sent).toHaveLength(1);
    expect(transport.connect.mock.calls.length).toBeGreaterThanOrEqual(2);
    const [published] = await rows();
    expect(published).toMatchObject({ status: 'PUBLISHED', attempt_count: 1 });
  });
});
