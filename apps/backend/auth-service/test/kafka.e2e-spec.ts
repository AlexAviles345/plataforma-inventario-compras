import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { KafkaJS } from '@confluentinc/kafka-javascript';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { KafkaTransport } from '../src/outbox/kafka-transport';
import { OutboxPublisher } from '../src/outbox/outbox-publisher';
import { UsersService } from '../src/users/users.service';

/**
 * Integración con un broker real (tópico creado por init-topics.sh). Requiere
 * el binario nativo de @confluentinc/kafka-javascript (Node 24) y Kafka en
 * KAFKA_BOOTSTRAP_SERVERS; se activa con KAFKA_E2E=true.
 */
const describeKafka =
  process.env.KAFKA_E2E === 'true' ? describe : describe.skip;

interface Received {
  key: string;
  partition: number;
  offset: number;
  event: { eventId: string; aggregateId: string; entityVersion: number };
}

describeKafka('Outbox → Kafka (real broker)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let users: UsersService;
  let config: ConfigService;
  let consumer: KafkaJS.Consumer;
  const received: Received[] = [];
  const brokers = () =>
    config.getOrThrow<string>('KAFKA_BOOTSTRAP_SERVERS').split(',');

  const publisherWith = (transport: KafkaTransport) =>
    new OutboxPublisher(dataSource, transport, config);

  const waitFor = async (predicate: () => boolean, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 200));
    expect(predicate()).toBe(true);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    users = app.get(UsersService);
    config = app.get(ConfigService);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KafkaJS: kafka } = require('@confluentinc/kafka-javascript') as {
      KafkaJS: typeof KafkaJS;
    };
    consumer = new kafka.Kafka({
      kafkaJS: { brokers: brokers(), logLevel: kafka.logLevel.ERROR },
    }).consumer({
      kafkaJS: { groupId: `auth-e2e-${randomUUID()}`, fromBeginning: false },
    });
    await consumer.connect();
    await consumer.subscribe({ topic: 'auth.users.events' });
    await consumer.run({
      eachMessage: ({ partition, message }) => {
        received.push({
          key: message.key?.toString('utf8') ?? '',
          partition,
          offset: Number(message.offset),
          event: JSON.parse(
            message.value?.toString('utf8') ?? '{}',
          ) as Received['event'],
        });
        return Promise.resolve();
      },
    });
    // Espera la asignación de particiones antes de producir.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }, 60_000);

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
  });

  afterAll(async () => {
    await consumer?.disconnect();
    await app?.close();
  });

  it('delivers versions of a user in order, keyed and on a single partition', async () => {
    const transport = new KafkaTransport({
      brokers: brokers(),
      clientId: 'auth-e2e',
      silent: true,
    });
    const publisher = publisherWith(transport);
    await transport.connect();
    try {
      const user = await users.createUser(
        {
          email: `kafka-${randomUUID().slice(0, 8)}@techdistribution.com`,
          displayName: 'Kafka',
          password: 'Kafka-Seguro-2026',
          assignments: [{ system: 'PURCHASES', role: 'PURCHASES_AGENT' }],
        },
        { actorUserId: null },
      );
      await users.updateUser(
        user.id,
        { expectedVersion: 1, active: false },
        { actorUserId: null },
      );

      await publisher.dispatchOnce();
      await publisher.dispatchOnce();

      const statuses = await dataSource.query<{ status: string }[]>(
        'SELECT status FROM outbox_events ORDER BY entity_version',
      );
      expect(statuses.map((s) => s.status)).toEqual(['PUBLISHED', 'PUBLISHED']);

      const mine = () => received.filter((r) => r.key === user.id);
      await waitFor(() => mine().length === 2);
      expect(mine().map((r) => r.event.entityVersion)).toEqual([1, 2]);
      expect(new Set(mine().map((r) => r.partition)).size).toBe(1);
      expect(mine()[1].offset).toBeGreaterThan(mine()[0].offset);
      expect(mine()[0].event.aggregateId).toBe(user.id);
    } finally {
      await transport.disconnect();
    }
  }, 60_000);

  it('keeps the event pending while Kafka is unreachable and delivers it later', async () => {
    const user = await users.createUser(
      {
        email: `caido-${randomUUID().slice(0, 8)}@techdistribution.com`,
        displayName: 'Kafka caído',
        password: 'Kafka-Seguro-2026',
        assignments: [],
      },
      { actorUserId: null },
    );

    // Broker inalcanzable: connect() vence, nada se envía y el evento sigue
    // PENDING sin consumir intentos. stop() no se queda colgado.
    const down = publisherWith(
      new KafkaTransport({
        brokers: ['127.0.0.1:1'],
        clientId: 'auth-e2e-down',
        silent: true,
        connectTimeoutMs: 2_000,
      }),
    );
    down.start();
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    expect(down.isConnected).toBe(false);
    const stopStarted = Date.now();
    await down.stop();
    expect(Date.now() - stopStarted).toBeLessThan(15_000);
    const [pending] = await dataSource.query<
      { status: string; attempt_count: number }[]
    >('SELECT status, attempt_count FROM outbox_events');
    expect(pending).toEqual({ status: 'PENDING', attempt_count: 0 });

    // El broker "vuelve": el publicador entrega lo pendiente.
    const up = publisherWith(
      new KafkaTransport({
        brokers: brokers(),
        clientId: 'auth-e2e',
        silent: true,
      }),
    );
    up.start();
    try {
      await waitFor(() => received.some((r) => r.key === user.id));
    } finally {
      await up.stop();
    }
    const [published] = await dataSource.query<{ status: string }[]>(
      'SELECT status FROM outbox_events',
    );
    expect(published.status).toBe('PUBLISHED');
  }, 60_000);
});
