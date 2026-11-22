package com.techdistribution.inventory.support;

import java.util.List;
import java.util.Map;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.kafka.ConfluentKafkaContainer;

/** Kafka real (misma imagen que docker-compose.example.yml) compartido por las pruebas. */
@TestConfiguration(proxyBeanMethods = false)
public class KafkaTestcontainer {

    public static final ConfluentKafkaContainer KAFKA = new ConfluentKafkaContainer("confluentinc/cp-kafka:7.4.0");
    private static final List<String> TOPICS = List.of(
            "auth.users.events", "inventory.products.events", "inventory.auth-users.dlq");
    private static boolean topicsCreated;

    @Bean
    @ServiceConnection
    ConfluentKafkaContainer kafkaContainer() {
        KAFKA.start();
        createTopics();
        return KAFKA;
    }

    /** Igual que infrastructure/kafka/init-topics.sh: tres particiones por tópico. */
    private static synchronized void createTopics() {
        if (topicsCreated) {
            return;
        }
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers()))) {
            admin.createTopics(TOPICS.stream().map(name -> new NewTopic(name, 3, (short) 1)).toList()).all().get();
            topicsCreated = true;
        } catch (Exception exception) {
            throw new IllegalStateException("No se pudieron crear los tópicos de prueba", exception);
        }
    }
}
