package com.techdistribution.inventory.product;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, UUID>, JpaSpecificationExecutor<Product> {

    boolean existsBySku(String sku);

    boolean existsBySkuAndIdNot(String sku, UUID id);

    /** SELECT ... FOR UPDATE: serializa las ediciones concurrentes del mismo producto. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") UUID id);

    @Query("""
            select new com.techdistribution.inventory.product.ProductStats$Totals(
                count(p),
                coalesce(sum(case when p.active = true then 1 else 0 end), 0),
                coalesce(sum(case when p.active = false then 1 else 0 end), 0),
                coalesce(sum(case when p.active = true and p.stockOnHand = 0 then 1 else 0 end), 0),
                coalesce(sum(p.stockOnHand), 0))
            from Product p
            """)
    ProductStats.Totals computeTotals();

    List<Product> findByActiveTrue(Pageable pageable);
}
