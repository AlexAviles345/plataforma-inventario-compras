# Microservicio de API Gateway

## Tecnología
Este microservicio está desarrollado utilizando **NestJS** y actúa como un proxy inverso haciendo uso de la librería **http-proxy-middleware**.

## Responsabilidad Principal
Es el **único punto de entrada** a la plataforma TechDistribution. Su objetivo principal es recibir todas las peticiones HTTP de los clientes web o móviles, validarlas y enrutarlas al microservicio correspondiente, aislando así la infraestructura interna del exterior.

## Funciones Clave

### 1. Enrutamiento Inverso (Proxy)
El Gateway expone rutas genéricas y redirige el tráfico hacia la red interna de microservicios sin alterar la estructura original de las URIs:
- Todas las peticiones a `/auth/*` se envían al microservicio de Autenticación.
- Todas las peticiones a `/inventory/*` se envían al microservicio de Inventario.
- Todas las peticiones a `/purchases/*` se envían al microservicio de Compras.

### 2. Autenticación Descentralizada y Guardián Global
Aunque el microservicio `Auth` es el dueño de los usuarios y creador de los tokens, el API Gateway cuenta con su propio **JwtAuthGuard**.
- **Validación Matemática:** El Gateway valida la firma del token JWT utilizando la clave secreta compartida, verificando su autenticidad y expiración **sin realizar llamadas síncronas (HTTP)** al microservicio de Autenticación.
- **Inyección de Identidad (Headers):** Una vez validado el token, el Gateway extrae la información del payload (como el ID del usuario y sus roles) y los inyecta en las cabeceras HTTP de la petición proxyada (`x-user-id` y `x-user-roles`). De esta manera, los microservicios destino confían ciegamente en la identidad provista por el Gateway.

### 3. Consolidación de Documentación (Swagger UI)
Para facilitar las pruebas de la plataforma sin tener que acceder puerto por puerto, el Gateway expone una interfaz unificada de **Swagger UI** en la ruta `/docs`.
Mediante la función "TopBar" (menú desplegable), el Gateway lee y renderiza los archivos JSON/OpenAPI autogenerados y expuestos directamente por cada microservicio, agrupando:
- La documentación del Auth Service (NestJS).
- La documentación del Inventory Service (Spring Boot).
- La documentación del Purchases Service (Django).

## Variables de Entorno
El Gateway necesita conocer las URLs internas de los microservicios destino y el secreto para validar los tokens. El archivo `.env` debe estructurarse de la siguiente manera:

```env
PORT=3000
JWT_SECRET=tu_super_secreto_compartido
AUTH_SERVICE_URL=http://localhost:3001
INVENTORY_SERVICE_URL=http://localhost:3002
PURCHASES_SERVICE_URL=http://localhost:3003
```
