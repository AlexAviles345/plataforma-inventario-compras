package com.techdistribution.inventory;

import com.techdistribution.inventory.snapshot.SnapshotCommand;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class InventoryServiceApplication {

	public static void main(String[] args) {
		if (SnapshotCommand.handles(args)) {
			System.exit(SnapshotCommand.run(args));
		}
		SpringApplication.run(InventoryServiceApplication.class, args);
	}

}
