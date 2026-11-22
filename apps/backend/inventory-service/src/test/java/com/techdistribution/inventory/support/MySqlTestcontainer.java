package com.techdistribution.inventory.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.mysql.MySQLContainer;

/**
 * MySQL real (misma imagen que docker-compose.example.yml) compartido por todos
 * los contextos de prueba; Flyway aplica las migraciones al arrancar.
 */
@TestConfiguration(proxyBeanMethods = false)
public class MySqlTestcontainer {

    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.0")
            .withDatabaseName("inventory_db")
            .withUsername("inventory_user")
            .withPassword("inventory_password");

    @Bean
    @ServiceConnection
    MySQLContainer mysqlContainer() {
        return MYSQL;
    }
}
