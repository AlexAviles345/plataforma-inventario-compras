package com.techdistribution.inventory.common.api;

/** Metadata de paginación: {@code totalPages = ceil(total / limit)} y 0 sin resultados. */
public record PaginationMeta(int page, int limit, long total, int totalPages) {

    public static PaginationMeta of(int page, int limit, long total) {
        int totalPages = total == 0 ? 0 : (int) ((total + limit - 1) / limit);
        return new PaginationMeta(page, limit, total, totalPages);
    }
}
