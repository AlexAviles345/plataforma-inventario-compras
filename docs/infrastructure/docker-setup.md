# Configuración de Infraestructura Local (Docker)

El archivo versionado `docker-compose.example.yml` levanta las bases y Kafka para desarrollo local. Sus credenciales son de demostración, no secretos de despliegue. Los puertos se publican solo en `127.0.0.1`. Los servicios de dominio se implementarán según el [plan](../planning.md). El futuro Compose de aplicaciones incorporará [Nginx como perfil edge](nginx-edge.md); el archivo actual todavía no levanta aplicaciones ni Nginx.

## Requisitos Previos

- [Docker](https://docs.docker.com/get-docker/) instalado.
- [Docker Compose](https://docs.docker.com/compose/install/) instalado.

## Iniciar la Infraestructura

Asegúrate de estar en la raíz del proyecto. Usa directamente el ejemplo versionado para que todos ejecuten la misma configuración:

```bash
docker compose -f docker-compose.example.yml config --quiet
docker compose -f docker-compose.example.yml up -d --wait postgres-auth postgres-purchases mysql-inventory kafka
docker compose -f docker-compose.example.yml run --rm kafka-init
```

Las mismas instrucciones funcionan en PowerShell y Bash. El último comando crea tópicos idempotentemente, después del healthcheck Kafka. Una copia local `docker-compose.yml` sigue ignorada si se requieren adaptaciones; nunca subir secretos reales a ninguna variante.

Luego, ejecuta el siguiente comando:

```bash
docker compose -f docker-compose.example.yml ps
```

Comprueba los estados saludables y revisa `docker compose -f docker-compose.example.yml logs` si alguno falla. Los healthchecks no sustituyen las pruebas de las aplicaciones.

## Servicios Incluidos

### 1. PostgreSQL (Auth Service)
- **Host**: `localhost`
- **Puerto**: `5432`
- **Base de Datos**: `auth_db`
- **Usuario**: `auth_user`
- **Contraseña**: `auth_password`

### 2. PostgreSQL (Purchases Service)
- **Host**: `localhost`
- **Puerto**: `5433` *(Nota: Mapeado al puerto 5433 localmente para evitar conflicto con Auth)*
- **Base de Datos**: `purchases_db`
- **Usuario**: `purchases_user`
- **Contraseña**: `purchases_password`

### 3. MySQL (Inventory Service)
- **Host**: `localhost`
- **Puerto**: `3306`
- **Base de Datos**: `inventory_db`
- **Usuario**: `inventory_user`
- **Contraseña**: `inventory_password`
- **Root Password**: `root_password`

### 4. Apache Kafka (KRaft Mode)
- **Host**: `localhost`
- **Puerto**: `9092`
- **Cluster ID**: `MkU3OEVBNTcwNTJENDM2Qk`

> [!NOTE]
> Kafka está configurado usando el modo **KRaft**, por lo que no requiere un contenedor de Zookeeper, haciendo la configuración más ligera y moderna.

Clientes en el host usan `localhost:9092`; dentro de Compose usan `kafka:29092`. El controller escucha en `kafka:29093` y no se publica al host. `KAFKA_LOG_DIRS=/var/lib/kafka/data` coincide con el volumen persistente `kafka_data`, incluidos los metadatos KRaft. El broker único con réplica 1 es exclusivamente para desarrollo.

`kafka-init` crea `auth.users.events` e `inventory.products.events` con tres particiones y siete días de retención, y las tres DLQ con treinta días. No habilitar autocreación ni compartir grupos entre dominios. [Grupos, schemas y recuperación](../architecture/event-driven-communication.md).

## Prueba de publicación y persistencia

En Bash, sobre un entorno de desarrollo:

```bash
docker compose -f docker-compose.example.yml exec -T kafka kafka-topics --bootstrap-server kafka:29092 --create --if-not-exists --topic smoke.persistence --partitions 1 --replication-factor 1
printf 'persisted\n' | docker compose -f docker-compose.example.yml exec -T kafka kafka-console-producer --bootstrap-server kafka:29092 --topic smoke.persistence
docker compose -f docker-compose.example.yml up -d --wait --force-recreate kafka
docker compose -f docker-compose.example.yml exec -T kafka kafka-console-consumer --bootstrap-server kafka:29092 --topic smoke.persistence --from-beginning --max-messages 1 --timeout-ms 15000
```

En PowerShell reemplaza `printf 'persisted\n'` por `'persisted'`. El consumidor debe imprimir `persisted` después de recrear el contenedor sin borrar volúmenes. CI ejecuta esta prueba. El tópico smoke no alimenta dominios.

## Detener la Infraestructura

Para detener los servicios, desde la raíz del proyecto ejecuta:

```bash
docker compose -f docker-compose.example.yml stop
```

Si deseas detener los contenedores y **eliminar** los volúmenes de datos (lo cual borrará la información de las bases de datos y Kafka), usa:

```bash
docker compose -f docker-compose.example.yml down -v
```

## Siguientes Pasos
Una vez que esta infraestructura base esté funcionando, puedes proceder a inicializar de manera independiente cada uno de los microservicios, configurando sus variables de entorno (`.env` o perfiles de Spring) con las credenciales arriba mencionadas.
