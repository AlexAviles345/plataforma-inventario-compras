package com.techdistribution.inventory.projection;

import com.techdistribution.inventory.common.api.UtcTimestamps;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ConsumerRecordRecoverer;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Publica en inventory.auth-users.dlq el mensaje original con su posición, el
 * error saneado, los intentos y la fecha (mismo formato que la DLQ de Purchases).
 * Espera el acknowledgement: si la DLQ falla lanza la excepción, el offset
 * original no se confirma y el mensaje se vuelve a procesar.
 */
@Component
public class UserEventDlqPublisher implements ConsumerRecordRecoverer {

    private static final Logger log = LoggerFactory.getLogger(UserEventDlqPublisher.class);
    private static final Pattern SECRETS = Pattern.compile(
            "(bearer\\s+[a-z0-9_\\-.]+|password\\s*[:=]\\s*\\S+|secret\\s*[:=]\\s*\\S+)", Pattern.CASE_INSENSITIVE);
    private static final int MAX_ERROR_LENGTH = 500;

    private final KafkaTemplate<String, String> kafka;
    private final UsersConsumerProperties properties;
    private final JsonMapper jsonMapper;

    public UserEventDlqPublisher(
            KafkaTemplate<String, String> kafka, UsersConsumerProperties properties, JsonMapper jsonMapper) {
        this.kafka = kafka;
        this.properties = properties;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void accept(ConsumerRecord<?, ?> record, Exception exception) {
        Throwable cause = rootCause(exception);
        boolean permanent = cause instanceof PermanentEventException;
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("consumerGroup", properties.groupId());
        envelope.put("originalTopic", record.topic());
        envelope.put("partition", record.partition());
        envelope.put("offset", record.offset());
        envelope.put("partitionKey", record.key() == null ? null : record.key().toString());
        envelope.put("rawPayload", record.value() == null ? null : record.value().toString());
        envelope.put("payloadEncoding", "utf-8");
        envelope.put("errorType", cause.getClass().getSimpleName());
        envelope.put("errorMessage", sanitize(cause.getMessage()));
        envelope.put("attemptCount", permanent ? 1 : properties.maxAttempts());
        envelope.put("failedAt", UtcTimestamps.format(UtcTimestamps.now()));

        String key = record.key() == null ? null : record.key().toString();
        try {
            kafka.send(properties.dlqTopic(), key, jsonMapper.writeValueAsString(envelope))
                    .get(properties.dlqSendTimeoutSeconds(), TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Publicación en DLQ interrumpida", interrupted);
        } catch (ExecutionException | TimeoutException failure) {
            throw new IllegalStateException("No se pudo publicar en la DLQ; el offset no se confirma", failure);
        }
        log.error("Evento de usuario enviado a {} ({}:{}@{}): {}", properties.dlqTopic(), record.topic(),
                record.partition(), record.offset(), envelope.get("errorMessage"));
    }

    static String sanitize(String message) {
        String cleaned = SECRETS.matcher(message == null ? "Error desconocido" : message).replaceAll("[REDACTED]");
        cleaned = cleaned.replaceAll("\\s+", " ").strip();
        return cleaned.length() > MAX_ERROR_LENGTH ? cleaned.substring(0, MAX_ERROR_LENGTH) : cleaned;
    }

    private static Throwable rootCause(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            if (current instanceof PermanentEventException) {
                return current;
            }
            current = current.getCause();
        }
        return current;
    }
}
