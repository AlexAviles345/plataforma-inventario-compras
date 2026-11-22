package com.techdistribution.inventory.snapshot;

import com.techdistribution.inventory.projection.PermanentEventException;
import com.techdistribution.inventory.projection.UserEvent;
import com.techdistribution.inventory.projection.UserEventValidator;
import com.techdistribution.inventory.projection.UserProjectionIngestor;
import com.techdistribution.inventory.projection.UsersConsumerProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reconstruye user_projections desde un snapshot de Auth cuando los eventos ya
 * vencieron en Kafka. Acepta el mismo formato que el importador de Purchases:
 * un arreglo de usuarios o {@code {"items": [...], "watermarks": {"0": 41}}}.
 * <ul>
 *   <li>valida todo el archivo antes de escribir y aplica en una sola transacción;</li>
 *   <li>solo reemplaza versiones menores (repetir la importación no cambia nada);</li>
 *   <li>con watermarks, deja el grupo del consumidor en {@code watermark + 1} para que,
 *       al arrancar, reproduzca solo los eventos posteriores al snapshot.</li>
 * </ul>
 * Debe ejecutarse con Inventory detenido: Kafka no permite mover offsets de un
 * grupo con consumidores activos.
 */
@Component
public class UserSnapshotImporter {

    public record Report(int applied, int skippedStale, Map<Integer, Long> watermarks, boolean offsetsMoved) {
    }

    private final UserEventValidator validator;
    private final UserProjectionIngestor ingestor;
    private final UsersConsumerProperties consumer;
    private final KafkaAdmin kafkaAdmin;
    private final TransactionTemplate transaction;
    private final JsonMapper jsonMapper;

    public UserSnapshotImporter(UserEventValidator validator, UserProjectionIngestor ingestor,
            UsersConsumerProperties consumer, KafkaAdmin kafkaAdmin,
            org.springframework.transaction.PlatformTransactionManager transactions, JsonMapper jsonMapper) {
        this.validator = validator;
        this.ingestor = ingestor;
        this.consumer = consumer;
        this.kafkaAdmin = kafkaAdmin;
        this.transaction = new TransactionTemplate(transactions);
        this.jsonMapper = jsonMapper;
    }

    public Report importFile(Path file, boolean moveOffsets) {
        JsonNode root = read(file);
        JsonNode itemsNode = root.isArray() ? root : root.get("items");
        if (itemsNode == null || !itemsNode.isArray()) {
            throw new SnapshotException("El archivo debe ser un arreglo o un objeto con la lista 'items'");
        }
        Map<Integer, Long> watermarks = root.isObject() ? watermarks(root.get("watermarks")) : Map.of();

        List<UserEvent> users = new ArrayList<>();
        for (int index = 0; index < itemsNode.size(); index++) {
            try {
                users.add(validator.validateSnapshotItem(itemsNode.get(index)));
            } catch (PermanentEventException exception) {
                throw new SnapshotException("items[" + index + "]: " + exception.getMessage()
                        + ". No se importó nada.");
            }
        }

        int[] counts = new int[2];
        transaction.executeWithoutResult(status -> {
            LocalDateTime now = ingestor.now();
            for (UserEvent user : users) {
                if (ingestor.applySnapshot(user, now) == UserProjectionIngestor.Outcome.APPLIED) {
                    counts[0]++;
                } else {
                    counts[1]++;
                }
            }
        });

        boolean moved = false;
        if (moveOffsets && !watermarks.isEmpty()) {
            moveConsumerGroup(watermarks);
            moved = true;
        }
        return new Report(counts[0], counts[1], watermarks, moved);
    }

    private void moveConsumerGroup(Map<Integer, Long> watermarks) {
        Map<TopicPartition, OffsetAndMetadata> offsets = new LinkedHashMap<>();
        watermarks.forEach((partition, watermark) ->
                offsets.put(new TopicPartition(consumer.topic(), partition), new OffsetAndMetadata(watermark + 1)));
        try (Admin admin = Admin.create(kafkaAdmin.getConfigurationProperties())) {
            admin.alterConsumerGroupOffsets(consumer.groupId(), offsets).all().get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new SnapshotException("Movimiento de offsets interrumpido");
        } catch (Exception exception) {
            throw new SnapshotException("Las proyecciones se importaron, pero no se pudo mover el grupo "
                    + consumer.groupId() + " (¿Inventory sigue en ejecución?): " + exception.getMessage());
        }
    }

    private Map<Integer, Long> watermarks(JsonNode node) {
        if (node == null || node.isNull()) {
            return Map.of();
        }
        if (!node.isObject()) {
            throw new SnapshotException("'watermarks' debe ser un objeto {\"partición\": offset}");
        }
        Map<Integer, Long> result = new TreeMap<>();
        for (Map.Entry<String, JsonNode> entry : node.properties()) {
            int partition;
            try {
                partition = Integer.parseInt(entry.getKey());
            } catch (NumberFormatException exception) {
                throw new SnapshotException("Partición inválida en watermarks: " + entry.getKey());
            }
            JsonNode offset = entry.getValue();
            if (partition < 0 || !offset.isIntegralNumber() || offset.longValue() < -1) {
                throw new SnapshotException("Watermark inválido para la partición " + entry.getKey());
            }
            result.put(partition, offset.longValue());
        }
        return result;
    }

    private JsonNode read(Path file) {
        if (!Files.isRegularFile(file)) {
            throw new SnapshotException("El archivo no existe: " + file);
        }
        try {
            String content = Files.readString(file);
            // Windows PowerShell 5.1 agrega BOM al guardar en UTF-8 con Out-File.
            if (content.startsWith("﻿")) {
                content = content.substring(1);
            }
            return jsonMapper.readTree(content);
        } catch (IOException | JacksonException exception) {
            throw new SnapshotException("No se pudo leer el JSON de " + file + ": " + exception.getMessage());
        }
    }
}
