package com.techdistribution.inventory.product;

import com.techdistribution.inventory.common.api.ApiResponse;
import com.techdistribution.inventory.common.web.RequestIdFilter;
import com.techdistribution.inventory.product.ProductApiDocs.CreateProductBody;
import com.techdistribution.inventory.product.ProductApiDocs.ErrorEnvelope;
import com.techdistribution.inventory.product.ProductApiDocs.ProductEnvelope;
import com.techdistribution.inventory.product.ProductApiDocs.ProductPageEnvelope;
import com.techdistribution.inventory.product.ProductApiDocs.StatsEnvelope;
import com.techdistribution.inventory.product.ProductApiDocs.UpdateProductBody;
import com.techdistribution.inventory.security.AuthenticatedActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping(path = "/api/inventory/products", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Productos", description = "Catálogo y existencias. Requiere token INVENTORY con rol ADMIN o INVENTORY_MANAGER.")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
            description = "AUTHENTICATION_REQUIRED o INVALID_TOKEN",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class))),
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403",
            description = "FORBIDDEN: token de otro sistema o rol sin permiso",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
})
public class ProductController {

    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "Catálogo paginado", description = "Ordenado por nombre. search busca en SKU y nombre.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
            content = @Content(schema = @Schema(implementation = ProductPageEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "VALIDATION_ERROR",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    public ApiResponse<List<ProductView>> list(
            @Parameter(description = "Página desde 1", example = "1") @RequestParam(required = false) String page,
            @Parameter(description = "Entre 1 y 100", example = "20") @RequestParam(required = false) String limit,
            @Parameter(description = "Texto contenido en SKU o nombre") @RequestParam(required = false) String search,
            @Parameter(description = "true o false") @RequestParam(required = false) String active,
            AuthenticatedActor actor) {
        ProductService.ProductPage result = service.list(ProductRequests.parseList(page, limit, search, active));
        return ApiResponse.paginated("Productos obtenidos exitosamente", result.products(), result.meta());
    }

    @GetMapping("/stats")
    @Operation(summary = "Estadísticas agregadas del catálogo")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
            content = @Content(schema = @Schema(implementation = StatsEnvelope.class)))
    public ApiResponse<ProductStats> stats(AuthenticatedActor actor) {
        return ApiResponse.of(200, "Estadísticas de inventario obtenidas exitosamente", service.stats());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detalle de un producto")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
            content = @Content(schema = @Schema(implementation = ProductEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "RESOURCE_NOT_FOUND",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    public ApiResponse<ProductView> get(@PathVariable String id, AuthenticatedActor actor) {
        return ApiResponse.of(200, "Producto obtenido exitosamente", service.get(ProductRequests.productId(id)));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Registrar producto",
            description = "Crea el producto con su existencia inicial y publica ProductCreated.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = CreateProductBody.class))))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201",
            content = @Content(schema = @Schema(implementation = ProductEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "VALIDATION_ERROR",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "SKU_ALREADY_EXISTS",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    public ResponseEntity<ApiResponse<ProductView>> create(
            @RequestBody(required = false) JsonNode body, AuthenticatedActor actor, HttpServletRequest request) {
        ProductView created = service.create(
                ProductRequests.parseCreate(body), actor, RequestIdFilter.requestId(request));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.of(201, "Producto creado exitosamente", created));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Editar, ajustar existencias o desactivar",
            description = "Exige expectedVersion. Un cambio de stock requiere reason y queda auditado. "
                    + "active:false desactiva lógicamente. Publica ProductUpdated.",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = UpdateProductBody.class))))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
            content = @Content(schema = @Schema(implementation = ProductEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "VALIDATION_ERROR",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "RESOURCE_NOT_FOUND",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409",
            description = "VERSION_CONFLICT o SKU_ALREADY_EXISTS",
            content = @Content(schema = @Schema(implementation = ErrorEnvelope.class)))
    public ApiResponse<ProductView> update(
            @PathVariable String id,
            @RequestBody(required = false) JsonNode body,
            AuthenticatedActor actor,
            HttpServletRequest request) {
        ProductView updated = service.update(
                ProductRequests.productId(id),
                ProductRequests.parseUpdate(body),
                actor,
                RequestIdFilter.requestId(request));
        return ApiResponse.of(200, "Producto actualizado exitosamente", updated);
    }
}
