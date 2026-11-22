package com.techdistribution.inventory.config;

import com.techdistribution.inventory.security.AuthenticatedActor;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfiguration {

    static {
        // El actor lo inyecta el filtro JWT; no es un parámetro que envíe el cliente.
        SpringDocUtils.getConfig().addRequestWrapperToIgnore(AuthenticatedActor.class);
    }

    @Bean
    public OpenAPI inventoryOpenApi() {
        return new OpenAPI()
                .servers(List.of(new Server().url("/")))
                .info(new Info()
                        .title("TechDistribution Inventory Service")
                        .description("Catálogo de productos y existencias")
                        .version("1.0"))
                .schemaRequirement(
                        "bearerAuth",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT"));
    }
}
