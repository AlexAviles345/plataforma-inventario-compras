package com.techdistribution.inventory.outbox;

import com.techdistribution.inventory.common.api.UtcTimestamps;
import com.techdistribution.inventory.product.Product;
import jakarta.persistence.EntityManager;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Inserta en el outbox, dentro de la transacción del cambio, el snapshot público
 * completo del producto según contracts/events/product-event.schema.json.
 */
@Component
public class ProductEventWriter {

    public static final String PRODUCT_CREATED = "ProductCreated";
    public static final String PRODUCT_UPDATED = "ProductUpdated";
    private static final String AGGREGATE_TYPE = "PRODUCT";

    private final EntityManager entityManager;
    private final JsonMapper jsonMapper;
    private final OutboxProperties properties;

    public ProductEventWriter(EntityManager entityManager, JsonMapper jsonMapper, OutboxProperties properties) {
        this.entityManager = entityManager;
        this.jsonMapper = jsonMapper;
        this.properties = properties;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public OutboxEvent record(Product product, String eventType, UUID correlationId) {
        UUID eventId = UUID.randomUUID();
        OutboxEvent event = OutboxEvent.pending(
                eventId,
                AGGREGATE_TYPE,
                product.getId(),
                eventType,
                product.getVersion(),
                properties.topic(),
                jsonMapper.writeValueAsString(payload(eventId, product, eventType, correlationId)),
                correlationId,
                product.getUpdatedAt());
        entityManager.persist(event);
        return event;
    }

    static Map<String, Object> payload(UUID eventId, Product product, String eventType, UUID correlationId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("productId", product.getId().toString());
        data.put("sku", product.getSku());
        data.put("name", product.getName());
        data.put("unit", product.getUnit());
        data.put("stockOnHand", product.getStockOnHand());
        data.put("active", product.isActive());
        data.put("createdBy", product.getCreatedBy().toString());
        data.put("updatedBy", product.getUpdatedBy().toString());

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId.toString());
        envelope.put("eventType", eventType);
        envelope.put("schemaVersion", 1);
        envelope.put("aggregateId", product.getId().toString());
        envelope.put("entityVersion", product.getVersion());
        envelope.put("timestamp", UtcTimestamps.format(product.getUpdatedAt()));
        envelope.put("correlationId", correlationId.toString());
        envelope.put("data", data);
        return envelope;
    }
}
