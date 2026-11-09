import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { createAuthApplication } from '../src/bootstrap';

describe('Auth Service foundation', () => {
  let app: NestExpressApplication;
  let server: Server;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DOCS_ENABLED: 'true',
      PORT: '3001',
    });
    app = await createAuthApplication();
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (server) server.closeAllConnections();
    if (app) await app.close();
  });

  it('exposes liveness and readiness outside the business prefix', async () => {
    await request(server).get('/health/live').expect(200, {
      status: 'ok',
      service: 'auth-service',
    });
    await request(server).get('/health/ready').expect(200, {
      status: 'ready',
      service: 'auth-service',
    });
  });

  it('exposes the agreed OpenAPI document in development', async () => {
    const response = await request(server)
      .get('/api/auth/openapi.json')
      .expect(200);
    expect(response.body).toMatchObject({
      info: { title: 'TechDistribution Auth Service', version: '1.0' },
    });
    await request(server).get('/docs').expect(200);
  });

  it('does not expose generated placeholder routes', async () => {
    await request(server).get('/').expect(404);
    await request(server).get('/api/auth').expect(404);
  });
});
