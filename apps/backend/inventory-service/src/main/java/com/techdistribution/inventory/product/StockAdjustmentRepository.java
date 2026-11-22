package com.techdistribution.inventory.product;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, UUID> {

    List<StockAdjustment> findByProductIdOrderByProductVersionAsc(UUID productId);
}
