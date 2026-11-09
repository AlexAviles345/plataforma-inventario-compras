import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { rateLimit } from 'express-rate-limit';
import { AppModule } from './app.module';
import { SCHEMA_PATHS } from './auth/jwt.guard';
import {
  GatewayExceptionFilter,
  sendGatewayError,
} from './common/http-exception.filter';
import { requestContext } from './common/request-context';

export async function createGateway(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  app.set('trust proxy', false);
  app.disable('x-powered-by');
  app.use(requestContext);
  app.enableCors({
    origin: config.getOrThrow<string[]>('CORS_ORIGINS'),
    credentials: false,
  });
  app.useGlobalFilters(new GatewayExceptionFilter());
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (request) =>
        request.method !== 'POST' ||
        request.originalUrl.split('?')[0] !== '/api/auth/login',
      handler: (_request, response) =>
        sendGatewayError(response, 429, 'Demasiados intentos de autenticación'),
    }),
  );
  if (config.getOrThrow<boolean>('DOCS_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('TechDistribution API Gateway')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, {
      explorer: true,
      swaggerOptions: {
        urls: SCHEMA_PATHS.map((url, index) => ({
          url,
          name: ['Auth', 'Inventory', 'Purchases'][index],
        })),
      },
    });
  }
  return app;
}
