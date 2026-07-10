import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GatewayExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilitar CORS para que Swagger pueda hacer peticiones si es necesario
  app.enableCors();
  
  app.useGlobalFilters(new GatewayExceptionFilter());

  // Configuración base del Gateway
  const config = new DocumentBuilder()
    .setTitle('TechDistribution API Gateway')
    .setDescription('Plataforma centralizada para Auth, Inventory y Purchases')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Configuramos el Swagger UI para que lea desde múltiples URLs (los microservicios)
  SwaggerModule.setup('docs', app, document, {
    explorer: true,
    swaggerOptions: {
      urls: [
        {
          // Endpoint proxyado hacia el NestJS Auth Service (su json de swagger)
          url: '/auth/api-json',
          name: '🔐 Auth Service (NestJS)',
        },
        {
          // Endpoint proxyado hacia Spring Boot Inventory Service
          url: '/inventory/v3/api-docs',
          name: '📦 Inventory Service (Spring Boot)',
        },
        {
          // Endpoint proxyado hacia Django Purchases Service
          url: '/purchases/api/schema/',
          name: '🛒 Purchases Service (Django)',
        },
      ],
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();