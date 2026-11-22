package com.techdistribution.inventory.projection;

import com.techdistribution.inventory.common.api.ApiException;
import com.techdistribution.inventory.security.AuthenticatedActor;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Además del token, exige que el usuario esté en la proyección local, activo y con
 * una asignación INVENTORY válida (mismo criterio que Purchases). Así una
 * desactivación en Auth corta el acceso en cuanto llega el evento, sin esperar a
 * que venza el token.
 */
@Component
public class UserAccessVerifier {

    private static final Set<String> INVENTORY_ROLES = Set.of("ADMIN", "INVENTORY_MANAGER");
    public static final int RETRY_AFTER_SECONDS = 2;

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;

    public UserAccessVerifier(JdbcClient jdbc, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
    }

    private record ProjectedUser(boolean active, String assignments) {
    }

    public void verify(AuthenticatedActor actor) {
        Optional<ProjectedUser> user = jdbc.sql("""
                        SELECT active, CAST(assignments AS CHAR) AS assignments
                        FROM user_projections WHERE user_id = UUID_TO_BIN(:id)
                        """)
                .param("id", actor.userId().toString())
                .query((rs, row) -> new ProjectedUser(rs.getBoolean("active"), rs.getString("assignments")))
                .optional();
        if (user.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "PROJECTION_NOT_READY",
                    "Tu usuario aún se está sincronizando con Inventario. Intenta de nuevo en unos segundos",
                    List.of(), Map.of("Retry-After", String.valueOf(RETRY_AFTER_SECONDS)));
        }
        if (!user.get().active()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "El usuario se encuentra inactivo");
        }
        if (!hasInventoryAssignment(user.get().assignments())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN",
                    "El usuario no tiene una asignación activa para el sistema de inventario");
        }
    }

    private boolean hasInventoryAssignment(String assignments) {
        JsonNode node = jsonMapper.readTree(assignments);
        for (JsonNode item : node) {
            JsonNode system = item.get("system");
            JsonNode role = item.get("role");
            if (system != null && "INVENTORY".equals(system.stringValue())
                    && role != null && INVENTORY_ROLES.contains(role.stringValue())) {
                return true;
            }
        }
        return false;
    }
}
