package com.techdistribution.inventory.projection;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.BackOffExecution;

/**
 * Contenedor del consumidor de usuarios:
 * <ul>
 *   <li>offset confirmado por registro y solo después del commit en MySQL;</li>
 *   <li>fallos transitorios: reintento bloqueante de la partición con 1, 2, 4, 8 y
 *       16 s más jitter; agotados, el mensaje va a la DLQ;</li>
 *   <li>errores permanentes de schema: directo a la DLQ, sin reintentos;</li>
 *   <li>si la DLQ falla, el error handler no confirma el offset y reintenta.</li>
 * </ul>
 */
@Configuration
public class UsersConsumerConfiguration {

    public static final String CONTAINER_FACTORY = "usersListenerContainerFactory";

    @Bean(name = CONTAINER_FACTORY)
    public ConcurrentKafkaListenerContainerFactory<String, String> usersListenerContainerFactory(
            ConsumerFactory<String, String> consumerFactory,
            UserEventDlqPublisher dlqPublisher,
            UsersConsumerProperties properties) {
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(
                dlqPublisher, new JitteredSequenceBackOff(properties.retryDelaysMs(), properties.maxJitterMs()));
        errorHandler.addNotRetryableExceptions(PermanentEventException.class);
        errorHandler.setCommitRecovered(true);

        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(errorHandler);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.RECORD);
        return factory;
    }

    /** Secuencia fija de esperas con jitter aleatorio; al agotarse detiene los reintentos. */
    static final class JitteredSequenceBackOff implements BackOff {

        private final List<Long> delaysMs;
        private final long maxJitterMs;

        JitteredSequenceBackOff(List<Long> delaysMs, long maxJitterMs) {
            this.delaysMs = List.copyOf(delaysMs);
            this.maxJitterMs = maxJitterMs;
        }

        @Override
        public BackOffExecution start() {
            int[] attempt = {0};
            return () -> {
                if (attempt[0] >= delaysMs.size()) {
                    return BackOffExecution.STOP;
                }
                long jitter = maxJitterMs > 0 ? ThreadLocalRandom.current().nextLong(maxJitterMs + 1) : 0;
                return delaysMs.get(attempt[0]++) + jitter;
            };
        }
    }
}
