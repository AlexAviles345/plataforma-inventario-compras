import { RequestMethod, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthExceptionFilter } from './common/http-exception.filter';
import { createRequestContextMiddleware } from './common/request-context';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { createValidationPipe } from './common/validation';

/**
 * Crea la aplicación con toda la configuración transversal. `rootModule`
 * permite a las pruebas montar controladores adicionales sobre AppModule.
 */
export async function createAuthApplication(
  rootModule: Type = AppModule,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    logger: process.env.NODE_ENV === 'test' ? false : undefined,
  });
  const config = app.get(ConfigService);
  const log = config.getOrThrow<string>('NODE_ENV') !== 'test';

  app.disable('x-powered-by');
  app.enableShutdownHooks();
  // Antes del body parser: los errores de parseo también llevan X-Request-Id.
  app.use(createRequestContextMiddleware({ log }));
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalInterceptors(
    new ResponseEnvelopeInterceptor(app.get(Reflector)),
  );
  app.useGlobalFilters(new AuthExceptionFilter({ log }));
  app.setGlobalPrefix('api/auth', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  if (config.getOrThrow<boolean>('DOCS_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('TechDistribution Auth Service')
        .setDescription('Usuarios, sistemas, asignaciones y emisión de tokens')
        .setVersion('1.0')
        .addServer('/')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: '/api/auth/openapi.json',
    });
  }

  return app;
}
