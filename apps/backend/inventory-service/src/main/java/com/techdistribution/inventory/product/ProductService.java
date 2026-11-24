package com.techdistribution.inventory.product;

import com.techdistribution.inventory.common.api.ApiException;
import com.techdistribution.inventory.common.api.PaginationMeta;
import com.techdistribution.inventory.common.api.UtcTimestamps;
import com.techdistribution.inventory.outbox.ProductEventWriter;
import com.techdistribution.inventory.product.ProductRequests.CreateProduct;
import com.techdistribution.inventory.product.ProductRequests.ListQuery;
import com.techdistribution.inventory.product.ProductRequests.UpdateProduct;
import com.techdistribution.inventory.security.AuthenticatedActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import jakarta.persistence.criteria.Predicate;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso del catálogo. Cada cambio confirma producto, ajuste de stock (si
 * aplica) y fila del outbox en una única transacción local.
 */
@Service
public class ProductService {

    private final ProductRepository products;
    private final ProductEventWriter events;
    private final EntityManager entityManager;
    private final Clock clock;

    public ProductService(
            ProductRepository products, ProductEventWriter events, EntityManager entityManager, Clock clock) {
        this.products = products;
        this.events = events;
        this.entityManager = entityManager;
        this.clock = clock;
    }

    public record ProductPage(List<ProductView> products, PaginationMeta meta) {
    }

    @Transactional(readOnly = true)
    public ProductPage list(ListQuery query) {
        Sort sort = Sort.by(Sort.Order.asc("name"), Sort.Order.asc("id"));
        Page<Product> page = products.findAll(filter(query), PageRequest.of(query.page() - 1, query.limit(), sort));
        List<ProductView> views = page.getContent().stream().map(ProductView::from).toList();
        return new ProductPage(views, PaginationMeta.of(query.page(), query.limit(), page.getTotalElements()));
    }

    @Transactional(readOnly = true)
    public ProductView get(UUID id) {
        return products.findById(id).map(ProductView::from).orElseThrow(ProductService::notFound);
    }

    @Transactional(readOnly = true)
    public ProductStats stats() {
        ProductStats.Totals totals = products.computeTotals();
        List<ProductStats.StockItem> lowStock = products
                .findByActiveTrue(PageRequest.of(
                        0, 5, Sort.by(Sort.Order.asc("stockOnHand"), Sort.Order.asc("name"), Sort.Order.asc("id"))))
                .stream()
                .map(ProductStats.StockItem::from)
                .toList();
        List<ProductStats.StockItem> topStock = products
                .findByActiveTrue(PageRequest.of(
                        0, 5, Sort.by(Sort.Order.desc("stockOnHand"), Sort.Order.asc("name"), Sort.Order.asc("id"))))
                .stream()
                .map(ProductStats.StockItem::from)
                .toList();
        return new ProductStats(
                totals.totalProducts(),
                totals.activeProducts(),
                totals.inactiveProducts(),
                totals.outOfStockProducts(),
                totals.totalUnitsOnHand(),
                lowStock,
                topStock);
    }

    @Transactional
    public ProductView create(CreateProduct command, AuthenticatedActor actor, UUID requestId) {
        if (products.existsBySku(command.sku())) {
            throw skuConflict();
        }
        Product product = Product.create(
                UUID.randomUUID(), command.sku(), command.name(), command.stockOnHand(), actor.userId(), now());
        entityManager.persist(product);
        entityManager.persist(StockAdjustment.initial(product, requestId));
        events.record(product, ProductEventWriter.PRODUCT_CREATED, requestId);
        flush();
        return ProductView.from(product);
    }

    @Transactional
    public ProductView update(UUID id, UpdateProduct command, AuthenticatedActor actor, UUID requestId) {
        Product product = products.findByIdForUpdate(id).orElseThrow(ProductService::notFound);
        if (product.getVersion() != command.expectedVersion()) {
            throw ApiException.versionConflict();
        }
        boolean stockChanged = product.getStockOnHand() != command.stockOnHand();
        if (stockChanged && command.reason() == null) {
            throw ApiException.validation("reason", "REQUIRED", "Explica el motivo del ajuste de existencias");
        }
        if (!product.getSku().equals(command.sku()) && products.existsBySkuAndIdNot(command.sku(), id)) {
            throw skuConflict();
        }
        if (!product.differsFrom(command.sku(), command.name(), command.stockOnHand(), command.active())) {
            return ProductView.from(product);
        }

        long previousStock = product.getStockOnHand();
        product.update(
                command.sku(), command.name(), command.stockOnHand(), command.active(), actor.userId(), now());
        if (stockChanged) {
            entityManager.persist(StockAdjustment.correction(product, previousStock, command.reason(), requestId));
        }
        events.record(product, ProductEventWriter.PRODUCT_UPDATED, requestId);
        flush();
        return ProductView.from(product);
    }

    private static Specification<Product> filter(ListQuery query) {
        return (root, criteria, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (query.active() != null) {
                predicates.add(builder.equal(root.get("active"), query.active()));
            }
            if (query.search() != null) {
                String pattern = "%" + escapeLike(query.search()) + "%";
                predicates.add(builder.or(
                        builder.like(root.get("sku"), pattern, '\\'),
                        builder.like(root.get("name"), pattern, '\\')));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** Fuerza los INSERT/UPDATE para traducir aquí la carrera de SKU duplicado. */
    private void flush() {
        try {
            entityManager.flush();
        } catch (PersistenceException exception) {
            if (isSkuUniqueViolation(exception)) {
                throw skuConflict();
            }
            throw exception;
        }
    }

    private static boolean isSkuUniqueViolation(Throwable exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause.getMessage() != null && cause.getMessage().contains("uq_products_sku")) {
                return true;
            }
        }
        return false;
    }

    private java.time.Instant now() {
        return UtcTimestamps.truncate(clock.instant());
    }

    private static ApiException notFound() {
        return ApiException.notFound("Producto no encontrado");
    }

    private static ApiException skuConflict() {
        return new ApiException(HttpStatus.CONFLICT, "SKU_ALREADY_EXISTS", "Ya existe un producto con ese SKU");
    }
}
