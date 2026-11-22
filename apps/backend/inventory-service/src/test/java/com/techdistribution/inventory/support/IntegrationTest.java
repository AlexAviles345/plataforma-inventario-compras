package com.techdistribution.inventory.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/** Base de pruebas de integración: aplicación completa sobre MySQL real. */
@SpringBootTest(properties = {
    "debug=false",
    "inventory.jwt.secret=" + Tokens.SECRET,
    "inventory.jwt.issuer=" + Tokens.ISSUER,
    "inventory.jwt.audience=" + Tokens.AUDIENCE,
    "inventory.jwt.max-ttl-seconds=900",
    "inventory.outbox.publisher-enabled=false"
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
    }
}
