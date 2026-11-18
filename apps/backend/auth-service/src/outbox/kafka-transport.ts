import type { KafkaJS } from '@confluentinc/kafka-javascript';
import type { OutboxMessage, OutboxTransport } from './outbox-transport';

export interface KafkaTransportOptions {
  brokers: string[];
  clientId: string;
  /** Sin logs del cliente (pruebas). */
  silent?: boolean;
  /** Tiempo máximo para obtener el acknowledgement antes de fallar el envío. */
  deliveryTimeoutMs?: number;
  /** Cuánto espera cada `connect()`; la conexión sigue en segundo plano. */
  connectTimeoutMs?: number;
}

/**
 * Productor Kafka (librdkafka) idempotente con `acks=all`.
 *
 * - La librería es nativa y se carga al conectar, no al importar este módulo:
 *   Auth y sus pruebas funcionan sin el binario mientras el publicador esté
 *   desactivado.
 * - Hay un único productor. Si el broker no responde, `connect()` deja de
 *   esperar al vencer el plazo pero la conexión sigue intentándose en segundo
 *   plano; la siguiente llamada espera ese mismo intento. Así una caída larga
 *   de Kafka no acumula productores.
 */
export class KafkaTransport implements OutboxTransport {
  private producer?: KafkaJS.Producer;
  private connecting?: Promise<void>;
  private ready = false;

  constructor(private readonly options: KafkaTransportOptions) {}

  async connect(): Promise<void> {
    if (this.ready) return;
    if (!this.connecting) {
      const producer = this.createProducer();
      this.producer = producer;
      this.connecting = producer.connect().then(
        () => {
          this.ready = true;
        },
        async (error: unknown) => {
          // Agotó sus reintentos: se libera para crear otro en el próximo intento.
          this.producer = undefined;
          this.connecting = undefined;
          await producer.disconnect().catch(() => undefined);
          throw error;
        },
      );
      // El rechazo se observa en las llamadas que esperan; evita avisos de
      // promesa no manejada si nadie está esperando en ese momento.
      this.connecting.catch(() => undefined);
    }
    const timeoutMs = this.options.connectTimeoutMs ?? 10_000;
    await withTimeout(
      this.connecting,
      timeoutMs,
      `Kafka no respondió en ${timeoutMs} ms (${this.options.brokers.join(',')})`,
    );
  }

  async send(message: OutboxMessage): Promise<void> {
    if (!this.ready || !this.producer)
      throw new Error('El productor Kafka no está conectado');
    await this.producer.send({
      topic: message.topic,
      messages: [{ key: message.key, value: message.value }],
    });
  }

  /** También aborta un intento de conexión en curso. */
  async disconnect(): Promise<void> {
    const producer = this.producer;
    this.producer = undefined;
    this.connecting = undefined;
    this.ready = false;
    if (producer)
      await withTimeout(
        producer.disconnect(),
        30_000,
        'El productor Kafka no se desconectó a tiempo',
      );
  }

  private createProducer(): KafkaJS.Producer {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KafkaJS: kafka } = require('@confluentinc/kafka-javascript') as {
      KafkaJS: typeof KafkaJS;
    };
    return new kafka.Kafka({
      kafkaJS: {
        brokers: this.options.brokers,
        clientId: this.options.clientId,
        logLevel: kafka.logLevel.WARN,
        logger: structuredLogger(this.options.silent ?? false),
      },
    }).producer({
      kafkaJS: {
        idempotent: true,
        acks: -1,
        maxInFlightRequests: 5,
        allowAutoTopicCreation: false,
      },
      // Sin ack en este plazo, send() falla y el outbox reprograma el evento.
      'message.timeout.ms': this.options.deliveryTimeoutMs ?? 30_000,
    });
  }
}

/**
 * Los mensajes de librdkafka salen como una línea JSON con el mismo formato
 * que el resto de Auth. Solo se registran advertencias y errores.
 */
function structuredLogger(silent: boolean): KafkaJS.Logger {
  const write =
    (level: 'warn' | 'error') => (message: string, extra?: object) => {
      if (silent) return;
      const fields = (extra ?? {}) as Record<string, unknown>;
      console[level](
        JSON.stringify({
          service: 'auth-service',
          type: 'kafka',
          level,
          message,
          ...(typeof fields.fac === 'string' ? { facility: fields.fac } : {}),
          ...(typeof fields.name === 'string' ? { client: fields.name } : {}),
        }),
      );
    };
  const logger: KafkaJS.Logger = {
    info: () => undefined,
    debug: () => undefined,
    warn: write('warn'),
    error: write('error'),
    namespace: () => logger,
    setLogLevel: () => undefined,
  };
  return logger;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
