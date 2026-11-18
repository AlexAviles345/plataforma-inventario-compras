import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { retryDelayMs, sanitizeError } from './backoff';
import { OUTBOX_TRANSPORT, type OutboxTransport } from './outbox-transport';

/** Un envío cuyo lease vence se considera abandonado y puede reclamarse. */
export const LEASE_SECONDS = 60;
export const BATCH_SIZE = 100;
/** Las filas publicadas se conservan 30 días como apoyo operativo. */
export const PUBLISHED_RETENTION_DAYS = 30;
const PURGE_INTERVAL_MS = 60 * 60_000;

interface ClaimedEvent {
  event_id: string;
  aggregate_id: string;
  entity_version: string;
  topic: string;
  partition_key: string;
  payload: unknown;
  attempt_count: number;
}

export interface DispatchReport {
  claimed: number;
  published: number;
  failed: number;
}

/**
 * Publica `outbox_events` en Kafka (docs/architecture/event-driven-communication.md):
 *
 * - Solo reclama la cabeza de cada agregado: el evento no publicado de menor
 *   versión. Así hay como máximo un envío en curso por agregado y la versión
 *   siguiente espera a que la anterior quede PUBLISHED.
 * - El reclamo es un UPDATE condicional (PENDING vencido o PUBLISHING con lease
 *   expirado), por lo que varias réplicas no envían el mismo evento a la vez.
 * - PUBLISHED solo tras el acknowledgement. Si el proceso cae antes de
 *   marcarlo, el lease vence y se reenvía el mismo `eventId`.
 * - Los fallos reprograman con backoff exponencial y jitter, sin límite de
 *   intentos: ningún evento se pierde ni se salta.
 */
@Injectable()
export class OutboxPublisher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly workerId =
    `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`.slice(0, 128);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = true;
  private connected = false;
  private connectFailures = 0;
  private lastPurge = 0;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(OUTBOX_TRANSPORT) private readonly transport: OutboxTransport,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<boolean>('OUTBOX_PUBLISHER_ENABLED')) this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /**
   * Arranca el ciclo sin esperar a Kafka: el HTTP nunca depende del broker.
   * La conexión se intenta dentro del ciclo; mientras falle, los eventos se
   * quedan PENDING (sin consumir intentos) y se reintenta con backoff.
   */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  /** Detiene el ciclo, espera el envío en curso y desconecta el productor. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
    // También aborta un intento de conexión que siga en segundo plano.
    this.connected = false;
    await this.transport.disconnect();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick().finally(() => {
        this.running = undefined;
      });
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let delay = this.config.get<number>('OUTBOX_POLL_INTERVAL_MS') ?? 1000;
    try {
      if (!this.connected) {
        try {
          await this.transport.connect();
          this.connected = true;
          this.connectFailures = 0;
        } catch (error) {
          this.connectFailures += 1;
          delay = retryDelayMs(this.connectFailures);
          this.log(
            'warn',
            'Kafka no disponible; los eventos siguen pendientes',
            {
              attempt: this.connectFailures,
              retryInMs: delay,
              error: sanitizeError(error),
            },
          );
          return;
        }
      }
      const report = await this.dispatchOnce();
      // Si el lote salió lleno puede haber más trabajo: continuar enseguida.
      if (report.claimed === BATCH_SIZE) delay = 0;
      if (Date.now() - this.lastPurge > PURGE_INTERVAL_MS) {
        this.lastPurge = Date.now();
        await this.purgePublished();
      }
    } catch (error) {
      this.log('error', 'Falló el ciclo del outbox', {
        error: sanitizeError(error),
      });
    } finally {
      this.schedule(delay);
    }
  }

  /** Una ronda: reclama cabezas listas, las envía en paralelo y registra el resultado. */
  async dispatchOnce(): Promise<DispatchReport> {
    const claimed = await this.claim();
    const results = await Promise.allSettled(
      claimed.map((event) => this.publish(event)),
    );
    const published = results.filter(
      (result) => result.status === 'fulfilled' && result.value,
    ).length;
    return {
      claimed: claimed.length,
      published,
      failed: claimed.length - published,
    };
  }

  /** Borra las filas publicadas hace más de 30 días. Devuelve cuántas borró. */
  async purgePublished(): Promise<number> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `DELETE FROM outbox_events
        WHERE status = 'PUBLISHED'
          AND published_at < now() - make_interval(days => $1)`,
      [PUBLISHED_RETENTION_DAYS],
    );
    return affected;
  }

  /** UPDATE ... RETURNING: TypeORM devuelve [filas, cantidad] en Postgres. */
  private async claim(): Promise<ClaimedEvent[]> {
    const [claimed] = await this.dataSource.query<[ClaimedEvent[], number]>(
      `WITH heads AS (
         SELECT DISTINCT ON (aggregate_id) event_id
           FROM outbox_events
          WHERE status <> 'PUBLISHED'
          ORDER BY aggregate_id, entity_version
       ), ready AS (
         SELECT o.event_id
           FROM outbox_events o
           JOIN heads h ON h.event_id = o.event_id
          WHERE (o.status = 'PENDING' AND o.next_attempt_at <= now())
             OR (o.status = 'PUBLISHING'
                 AND o.locked_at < now() - make_interval(secs => $2))
          ORDER BY o.next_attempt_at, o.created_at
          LIMIT $3
       )
       UPDATE outbox_events o
          SET status = 'PUBLISHING',
              locked_at = now(),
              locked_by = $1,
              attempt_count = o.attempt_count + 1
         FROM ready
        WHERE o.event_id = ready.event_id
          AND ((o.status = 'PENDING' AND o.next_attempt_at <= now())
            OR (o.status = 'PUBLISHING'
                AND o.locked_at < now() - make_interval(secs => $2)))
       RETURNING o.event_id, o.aggregate_id, o.entity_version, o.topic,
                 o.partition_key, o.payload, o.attempt_count`,
      [this.workerId, LEASE_SECONDS, BATCH_SIZE],
    );
    return claimed;
  }

  /** true si quedó PUBLISHED; false si se reprogramó. */
  private async publish(event: ClaimedEvent): Promise<boolean> {
    try {
      await this.transport.send({
        topic: event.topic,
        key: event.partition_key,
        value: JSON.stringify(event.payload),
      });
    } catch (error) {
      const delayMs = retryDelayMs(event.attempt_count);
      const lastError = sanitizeError(error);
      await this.dataSource.query(
        `UPDATE outbox_events
            SET status = 'PENDING', locked_at = NULL, locked_by = NULL,
                next_attempt_at = now() + make_interval(secs => $3),
                last_error = $4
          WHERE event_id = $1 AND locked_by = $2`,
        [event.event_id, this.workerId, delayMs / 1000, lastError],
      );
      this.log('warn', 'No se pudo publicar el evento; se reintentará', {
        eventId: event.event_id,
        aggregateId: event.aggregate_id,
        entityVersion: Number(event.entity_version),
        attempt: event.attempt_count,
        retryInMs: delayMs,
        error: lastError,
      });
      return false;
    }

    // Solo marca si conserva el lease; si lo perdió, otra réplica reenviará el
    // mismo eventId y los consumidores lo deduplican.
    await this.dataSource.query(
      `UPDATE outbox_events
          SET status = 'PUBLISHED', published_at = now(),
              locked_at = NULL, locked_by = NULL, last_error = NULL
        WHERE event_id = $1 AND locked_by = $2`,
      [event.event_id, this.workerId],
    );
    return true;
  }

  private log(
    level: 'warn' | 'error',
    message: string,
    fields: Record<string, unknown>,
  ): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    console[level](
      JSON.stringify({
        service: 'auth-service',
        type: 'outbox',
        level,
        workerId: this.workerId,
        message,
        ...fields,
      }),
    );
  }
}
