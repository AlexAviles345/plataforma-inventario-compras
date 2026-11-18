import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaTransport } from './kafka-transport';
import { OutboxPublisher } from './outbox-publisher';
import { OUTBOX_TRANSPORT } from './outbox-transport';

@Module({
  providers: [
    OutboxPublisher,
    {
      provide: OUTBOX_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new KafkaTransport({
          brokers: config
            .getOrThrow<string>('KAFKA_BOOTSTRAP_SERVERS')
            .split(','),
          clientId: 'auth-service',
          silent: config.get<string>('NODE_ENV') === 'test',
        }),
    },
  ],
  exports: [OutboxPublisher],
})
export class OutboxModule {}
