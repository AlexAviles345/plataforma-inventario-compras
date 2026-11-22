package com.techdistribution.inventory.snapshot;

import com.techdistribution.inventory.InventoryServiceApplication;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Comandos administrativos de snapshot. Los mensajes de consola van sin acentos
 * para leerse bien en cualquier página de códigos de Windows. Arrancan Inventory sin servidor web, sin
 * consumidor y sin publicador automático, ejecutan la tarea y terminan:
 *
 * <pre>
 * java -jar app.jar export-product-snapshot --file=productos.json
 * java -jar app.jar import-user-snapshot --file=usuarios.json [--skip-offsets]
 * </pre>
 */
public final class SnapshotCommand {

    public static final String EXPORT_PRODUCTS = "export-product-snapshot";
    public static final String IMPORT_USERS = "import-user-snapshot";
    private static final List<String> COMMANDS = List.of(EXPORT_PRODUCTS, IMPORT_USERS);

    private SnapshotCommand() {
    }

    public static boolean handles(String[] args) {
        return args.length > 0 && COMMANDS.contains(args[0]);
    }

    /** Devuelve el código de salida: 0 éxito, 1 error, 2 uso incorrecto. */
    public static int run(String[] args) {
        List<String> options = Arrays.asList(args).subList(1, args.length);
        String file = options.stream().filter(o -> o.startsWith("--file=")).map(o -> o.substring(7))
                .findFirst().orElse(null);
        if (file == null || file.isBlank()) {
            System.err.println("Uso: " + args[0] + " --file=<ruta.json>"
                    + (IMPORT_USERS.equals(args[0]) ? " [--skip-offsets]" : ""));
            return 2;
        }
        ConfigurableApplicationContext context = new SpringApplicationBuilder(InventoryServiceApplication.class)
                .web(WebApplicationType.NONE)
                .properties(
                        "inventory.users-consumer.enabled=false",
                        "inventory.outbox.publisher-enabled=false",
                        "spring.main.banner-mode=off")
                .run();
        try {
            if (EXPORT_PRODUCTS.equals(args[0])) {
                ProductSnapshotExporter.Report report =
                        context.getBean(ProductSnapshotExporter.class).export(Path.of(file));
                System.out.printf("Snapshot exportado: %d productos en %s%nWatermarks (ultimo offset por particion): %s%n"
                                + "En Purchases: python manage.py import_projection_snapshot --domain product --file %s%n",
                        report.products(), report.file().toAbsolutePath(), report.watermarks(), file);
            } else {
                UserSnapshotImporter.Report report = context.getBean(UserSnapshotImporter.class)
                        .importFile(Path.of(file), !options.contains("--skip-offsets"));
                System.out.printf("Usuarios aplicados: %d, ignorados por version: %d%n", report.applied(),
                        report.skippedStale());
                System.out.println(report.offsetsMoved()
                        ? "Grupo del consumidor posicionado despues de los watermarks " + report.watermarks()
                        : "Offsets del consumidor sin cambios");
            }
            return 0;
        } catch (SnapshotException exception) {
            System.err.println("Error: " + exception.getMessage());
            return 1;
        } finally {
            context.close();
        }
    }
}
