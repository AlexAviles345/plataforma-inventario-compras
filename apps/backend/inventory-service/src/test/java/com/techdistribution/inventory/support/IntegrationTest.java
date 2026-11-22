package com.techdistribution.inventory.support;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/**
 * Base de pruebas de integración: aplicación completa sobre MySQL real. El usuario
 * de {@link Tokens} empieza proyectado, activo y con asignación INVENTORY.
 */
@SpringBootTest(properties = {
    "debug=false",
    "inventory.jwt.secret=" + Tokens.SECRET,
    "inventory.jwt.issuer=" + Tokens.ISSUER,
    "inventory.jwt.audience=" + Tokens.AUDIENCE,
    "inventory.jwt.max-ttl-seconds=900",
    "inventory.outbox.publisher-enabled=false",
    "inventory.users-consumer.enabled=false"
})
@AutoConfigureMockMvc
@Import(MySqlTestcontainer.class)
public abstract class IntegrationTest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcClient jdbc;

    @Autowired
    protected JsonMapper jsonMapper;

    @BeforeEach
    void cleanDatabase() {
        jdbc.sql("DELETE FROM stock_adjustments").update();
        jdbc.sql("DELETE FROM outbox_events").update();
        jdbc.sql("DELETE FROM products").update();
        jdbc.sql("DELETE FROM inbox_events").update();
        jdbc.sql("DELETE FROM user_projections").update();
        projectUser(Tokens.MANAGER_ID, true, "[{\"system\":\"INVENTORY\",\"role\":\"INVENTORY_MANAGER\"}]");
    }

    /** Inserta o reemplaza directamente la proyección de un usuario. */
    protected void projectUser(UUID userId, boolean active, String assignmentsJson) {
        jdbc.sql("DELETE FROM user_projections WHERE user_id = UUID_TO_BIN(:id)")
                .param("id", userId.toString())
                .update();
        jdbc.sql("""
                INSERT INTO user_projections (user_id, email, display_name, active, assignments, entity_version,
                                              source_event_id, source_event_at, projected_at)
                VALUES (UUID_TO_BIN(:id), 'gestor@techdistribution.test', 'Gestor', :active, :assignments, 1,
                        UUID_TO_BIN(:eventId), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
                """)
                .param("id", userId.toString())
                .param("active", active)
                .param("assignments", assignmentsJson)
                .param("eventId", UUID.randomUUID().toString())
                .update();
    }
}
