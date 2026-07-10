# Configuración de Infraestructura Local (Docker)

Para facilitar el desarrollo local y evitar la instalación nativa de múltiples motores de base de datos y un broker de mensajería, hemos preparado un archivo `docker-compose.yml` que levanta toda la infraestructura necesaria para que los microservicios funcionen.

## Requisitos Previos

- [Docker](https://docs.docker.com/get-docker/) instalado.
- [Docker Compose](https://docs.docker.com/compose/install/) instalado.

## Iniciar la Infraestructura

Asegúrate de estar en la raíz del proyecto. Como buena práctica de seguridad, el archivo real es ignorado por git. Primero debes crear tu copia local a partir del ejemplo:

```bash
cp docker-compose.example.yml docker-compose.yml
```

*(En Windows PowerShell puedes usar `Copy-Item docker-compose.example.yml docker-compose.yml`)*

Luego, ejecuta el siguiente comando:

```bash
docker compose up -d
```

Este comando descargará las imágenes necesarias (si no las tienes) y levantará los contenedores en segundo plano.

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

## Detener la Infraestructura

Para detener los servicios, desde la raíz del proyecto ejecuta:

```bash
docker compose stop
```

Si deseas detener los contenedores y **eliminar** los volúmenes de datos (lo cual borrará la información de las bases de datos y Kafka), usa:

```bash
docker compose down -v
```

## Siguientes Pasos
Una vez que esta infraestructura base esté funcionando, puedes proceder a inicializar de manera independiente cada uno de los microservicios, configurando sus variables de entorno (`.env` o perfiles de Spring) con las credenciales arriba mencionadas.
