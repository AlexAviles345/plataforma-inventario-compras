package com.techdistribution.inventory.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.techdistribution.inventory.support.IntegrationTest;
import com.techdistribution.inventory.support.Tokens;
import java.time.Instant;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.Test;

class AuthenticationTests extends IntegrationTest {

    private static final String PRODUCTS = "/api/inventory/products";

    @Test
    void rejectsMissingToken() throws Exception {
        mockMvc.perform(get(PRODUCTS))
                .andExpect(status().isUnauthorized())
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(jsonPath("$.error").value(true))
                .andExpect(jsonPath("$.statusCode").value(401))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
                .andExpect(jsonPath("$.source").value("inventory"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void rejectsNonBearerAuthorization() throws Exception {
        mockMvc.perform(get(PRODUCTS).header("Authorization", "Basic abc"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void acceptsInventoryManagerAndAdmin() throws Exception {
        mockMvc.perform(get(PRODUCTS).header("Authorization", Tokens.bearer(Tokens.manager())))
                .andExpect(status().isOk());
        mockMvc.perform(get(PRODUCTS).header("Authorization",
                        Tokens.bearer(Tokens.sign(Tokens.claims("ADMIN", "INVENTORY")))))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsTokensIssuedForPurchases() throws Exception {
        mockMvc.perform(get(PRODUCTS).header("Authorization",
                        Tokens.bearer(Tokens.sign(Tokens.claims("PURCHASES_AGENT", "PURCHASES")))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(get(PRODUCTS).header("Authorization",
                        Tokens.bearer(Tokens.sign(Tokens.claims("ADMIN", "PURCHASES")))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void ignoresIdentityHeadersWithoutToken() throws Exception {
        mockMvc.perform(get(PRODUCTS)
                        .header("x-user-id", Tokens.MANAGER_ID.toString())
                        .header("x-user-roles", "[\"ADMIN\"]")
                        .header("x-user-system", "INVENTORY"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsWrongSignatureAndAlgorithm() throws Exception {
        Map<String, Object> claims = Tokens.claims("INVENTORY_MANAGER", "INVENTORY");
        String wrongSecret = Tokens.sign(claims, "{\"alg\":\"HS256\",\"typ\":\"JWT\"}",
                "another-secret-with-at-least-thirty-two-bytes!!");
        String noneAlgorithm = Tokens.sign(claims, "{\"alg\":\"none\",\"typ\":\"JWT\"}", Tokens.SECRET);
        for (String token : new String[] {wrongSecret, noneAlgorithm, "not.a.jwt", "abc"}) {
            mockMvc.perform(get(PRODUCTS).header("Authorization", Tokens.bearer(token)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidClaims")
    void rejectsInvalidClaims(String scenario, Consumer<Map<String, Object>> mutation) throws Exception {
        Map<String, Object> claims = Tokens.claims("INVENTORY_MANAGER", "INVENTORY");
        mutation.accept(claims);
        mockMvc.perform(get(PRODUCTS).header("Authorization", Tokens.bearer(Tokens.sign(claims))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    static Stream<Arguments> invalidClaims() {
        long now = Instant.now().getEpochSecond();
        return Stream.of(
                scenario("expirado", c -> {
                    c.put("iat", now - 1000);
                    c.put("exp", now - 100);
                }),
                scenario("TTL mayor al máximo", c -> c.put("exp", now + 3600)),
                scenario("emitido en el futuro", c -> {
                    c.put("iat", now + 120);
                    c.put("exp", now + 600);
                }),
                scenario("emisor incorrecto", c -> c.put("iss", "otro-emisor")),
                scenario("audiencia incorrecta", c -> c.put("aud", "otra-api")),
                scenario("sub no UUID", c -> c.put("sub", "usuario-1")),
                scenario("email inválido", c -> c.put("email", "sin-arroba")),
                scenario("rol inexistente", c -> c.put("role", "SUPERUSER")),
                scenario("gestor de inventario con sistema PURCHASES", c -> c.put("system", "PURCHASES")),
                scenario("claim roles en plural", c -> c.put("roles", "ADMIN")),
                scenario("iat no entero", c -> c.put("iat", String.valueOf(now))),
                scenario("sin exp", c -> c.remove("exp")));
    }

    private static Arguments scenario(String name, Consumer<Map<String, Object>> mutation) {
        return Arguments.of(name, mutation);
    }
}
