# 🌐 API Gateway (NestJS)

Este microservicio actúa como el punto único de entrada para toda la plataforma **TechDistribution**. Se encarga de enrutar las peticiones hacia los microservicios correspondientes y validar la identidad del usuario de manera centralizada.

Para conocer en profundidad sus responsabilidades arquitectónicas (cómo inyecta cabeceras y consolida Swagger), revisa la [Documentación del API Gateway](../.docs/services/api-gateway.md).

## Requisitos Previos

- [Node.js](https://nodejs.org/) (v18+)
- NPM instalado

## Configuración Inicial

1. **Instalar Dependencias**:
   Asegúrate de estar posicionado en esta carpeta (`api-gateway/`) y ejecuta:
   ```bash
   npm install
   ```

2. **Variables de Entorno**:
   El proyecto requiere configuraciones sensibles para funcionar. Copia el archivo de plantilla `.env.example` a un nuevo archivo `.env`:
   ```bash
   cp .env.example .env
   ```
   *(En Windows PowerShell puedes usar `Copy-Item .env.example .env`)*

   Abre el archivo `.env` recién creado y asegúrate de configurar correctamente el secreto JWT (que compartirá con el servicio Auth) y los puertos donde correrán los demás microservicios localmente.

## Ejecutar el Gateway

```bash
# Iniciar en modo desarrollo (watch mode)
npm run start:dev

# Compilar e iniciar en modo producción
npm run build
npm run start:prod
```

## Explorar la Documentación (Swagger UI)

Una vez que el Gateway esté en ejecución, puedes acceder a la interfaz centralizada para probar los endpoints en:

👉 **[http://localhost:3000/docs](http://localhost:3000/docs)**

En la esquina superior derecha encontrarás un menú desplegable (TopBar) para alternar entre las especificaciones Swagger del servicio de Auth, Inventario y Compras.
