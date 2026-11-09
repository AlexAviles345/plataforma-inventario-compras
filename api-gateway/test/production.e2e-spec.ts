import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';

describe('Production documentation policy', () => {
  let app: NestExpressApplication;
  let server: Server;
  const secret = 'production-policy-test-secret-with-at-least-32-bytes';

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DOCS_ENABLED: 'false',
      JWT_SECRET: secret,
      AUTH_SERVICE_URL: 'http://127.0.0.1:9',
      INVENTORY_SERVICE_URL: 'http://127.0.0.1:9',
      PURCHASES_SERVICE_URL: 'http://127.0.0.1:9',
      JWT_ISSUER: 'techdistribution-auth',
      JWT_AUDIENCE: 'techdistribution-api',
    });
    const { createGateway } = await import('../src/bootstrap');
    app = await createGateway();
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (server) server.closeAllConnections();
    if (app) await app.close();
  });

  it.each([
    '/docs',
    '/docs-json',
    '/api/auth/openapi.json',
    '/api/inventory/openapi.json',
    '/api/purchases/openapi.json',
  ])('disables %s even with valid credentials', async (path) => {
    const jwt = new JwtService({ secret });
    const token = jwt.sign(
      {
        sub: randomUUID(),
        email: 'admin@example.com',
        role: 'ADMIN',
        system: 'INVENTORY',
      },
      {
        expiresIn: 300,
        issuer: 'techdistribution-auth',
        audience: 'techdistribution-api',
      },
    );
    await request(server).get(path).expect(404);
    await request(server)
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
