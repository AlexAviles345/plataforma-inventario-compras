import { createServer, request as httpRequest, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

interface Echo {
  path: string;
  method: string;
  body: string;
  headers: Record<string, string | undefined>;
}

describe('Gateway HTTP integration', () => {
  let app: NestExpressApplication;
  let upstream: Server;
  let jwt: JwtService;
  let server: Server;
  let baseUrl: string;
  const secret = 'local-integration-secret-with-more-than-32-bytes';
  const claims = {
    sub: randomUUID(),
    email: 'test@example.com',
    role: 'INVENTORY_MANAGER',
    system: 'INVENTORY',
  };
  const received: Echo[] = [];
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

  function token(overrides: Record<string, unknown> = {}): string {
    return jwt.sign({ ...claims, ...overrides }, { expiresIn: 300 });
  }
  const bearer = (value: string) => `Bearer ${value}`;
  const echo = (response: { text: string }) =>
    JSON.parse(response.text) as Echo;

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      if (req.url?.endsWith('/slow')) return;
      if (req.url?.endsWith('/reset')) {
        req.socket.destroy();
        return;
      }
      if (req.url?.endsWith('/domain-error')) {
        res.writeHead(422, { 'content-type': 'application/json' });
        res.end('{"source":"inventory","message":"invalid"}');
        return;
      }
      if (req.url?.endsWith('/openapi.json')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            openapi: '3.0.0',
            info: { title: 'Fixture', version: '1' },
            servers: [{ url: '/' }],
            paths: {},
          }),
        );
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const data: Echo = {
          path: req.url ?? '',
          method: req.method ?? '',
          body: Buffer.concat(chunks).toString('base64'),
          headers: req.headers as Echo['headers'],
        };
        received.push(data);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      });
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    const stopped = createServer();
    await new Promise<void>((resolve) =>
      stopped.listen(0, '127.0.0.1', resolve),
    );
    const closedPort = (stopped.address() as AddressInfo).port;
    await new Promise<void>((resolve) => stopped.close(() => resolve()));
    Object.assign(process.env, {
      NODE_ENV: 'test',
      JWT_SECRET: secret,
      JWT_ISSUER: 'techdistribution-auth',
      JWT_AUDIENCE: 'techdistribution-api',
      AUTH_SERVICE_URL: url,
      INVENTORY_SERVICE_URL: url,
      PURCHASES_SERVICE_URL: `http://127.0.0.1:${closedPort}`,
      DOCS_ENABLED: 'true',
      PROXY_TIMEOUT_MS: '200',
      MAX_BODY_BYTES: '1024',
      CORS_ORIGINS: 'http://localhost:5173',
    });
    const { createGateway } = await import('../src/bootstrap');
    app = await createGateway();
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    jwt = new JwtService({
      secret,
      signOptions: {
        issuer: 'techdistribution-auth',
        audience: 'techdistribution-api',
      },
    });
  });

  afterAll(async () => {
    info.mockRestore();
    if (server) server.closeAllConnections();
    if (app) await app.close();
    if (upstream) {
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });

  it('forwards login JSON exactly and strips forged identity/forwarding headers', async () => {
    const body = '{ "email": "test@example.com", "password": "demo" }';
    const response = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set('x-user-id', 'forged')
      .set('x-request-id', 'forged-request-id')
      .set('x-user-roles', '["ADMIN"]')
      .set('x-user-system', 'PURCHASES')
      .set('x-forwarded-for', '1.2.3.4')
      .set('Forwarded', 'for=1.2.3.4')
      .send(body)
      .expect(200);
    const data = echo(response);
    expect(response.headers['x-request-id']).toBe(data.headers['x-request-id']);
    expect(data.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(data.headers['x-request-id']).not.toBe('forged-request-id');
    expect(Buffer.from(data.body, 'base64').toString()).toBe(body);
    expect(data.path).toBe('/api/auth/login');
    for (const header of [
      'x-user-id',
      'x-user-roles',
      'x-user-system',
      'x-forwarded-for',
      'forwarded',
    ])
      expect(data.headers[header]).toBeUndefined();
  });

  it.each([
    ['get', '/api/auth/login'],
    ['post', '/api/auth/login/admin'],
    ['post', '/api/auth/login-extra'],
    ['post', '/api/auth/register'],
    ['post', '/api/auth/login/'],
    ['post', '/api/auth/users'],
  ] as const)('requires authentication for %s %s', async (method, path) => {
    await request(server)[method](path).expect(401);
  });

  it('rejects the old, undocumented prefix', async () => {
    await request(server).post('/auth/login').expect(404);
  });

  it('preserves path, query, bearer token and canonical role', async () => {
    const access = token();
    const response = await request(server)
      .get('/api/inventory/products?limit=2')
      .set('Authorization', bearer(access))
      .set('x-user-id', 'forged')
      .expect(200);
    expect(echo(response)).toMatchObject({
      path: '/api/inventory/products?limit=2',
      headers: {
        authorization: bearer(access),
        'x-user-id': claims.sub,
        'x-user-roles': '["INVENTORY_MANAGER"]',
        'x-user-system': 'INVENTORY',
      },
    });
  });

  it.each([
    'application/json',
    'application/x-www-form-urlencoded',
    'application/octet-stream',
  ])('preserves PUT bytes for %s', async (contentType) => {
    const body =
      contentType === 'application/octet-stream'
        ? Buffer.from([0, 255, 1, 2])
        : contentType === 'application/json'
          ? '{ "name": "Teclado" }'
          : 'a=1&b=two';
    const response = await request(server)
      .put('/api/inventory/products/123')
      .set('Authorization', bearer(token()))
      .set('Content-Type', contentType)
      .send(body)
      .expect(200);
    expect(echo(response).body).toBe(Buffer.from(body).toString('base64'));
  });

  it('rejects tokens for a different system', async () => {
    await request(server)
      .get('/api/purchases/orders')
      .set('Authorization', bearer(token()))
      .expect(403);
  });

  it.each([
    { sub: undefined },
    { sub: 'not-a-uuid' },
    { email: undefined },
    { role: undefined },
    { role: 'OWNER' },
    { role: ['ADMIN'] },
    { system: undefined },
    { system: 'PURCHASES' },
    { iat: Math.floor(Date.now() / 1000) + 1000 },
  ])('rejects invalid claims: %j', async (overrides) => {
    await request(server)
      .get('/api/inventory/products')
      .set('Authorization', bearer(token(overrides)))
      .expect(401);
  });

  it('rejects missing, expired or overly long expiration', async () => {
    const withoutExp = jwt.sign(claims);
    const expired = jwt.sign(claims, { expiresIn: -1 });
    const tooLong = jwt.sign(claims, { expiresIn: 3600 });
    for (const value of [withoutExp, expired, tooLong])
      await request(server)
        .get('/api/inventory/products')
        .set('Authorization', bearer(value))
        .expect(401);
  });

  it('rejects incorrect signature, algorithm, issuer and audience', async () => {
    const wrongKey = new JwtService({ secret: 'incorrect-secret' }).sign(
      claims,
      { expiresIn: 300 },
    );
    const wrongAlgorithm = jwt.sign(claims, {
      algorithm: 'HS384',
      expiresIn: 300,
    });
    const wrongIssuer = jwt.sign(claims, { issuer: 'other', expiresIn: 300 });
    const wrongAudience = jwt.sign(claims, {
      audience: 'other',
      expiresIn: 300,
    });
    for (const value of [wrongKey, wrongAlgorithm, wrongIssuer, wrongAudience])
      await request(server)
        .get('/api/inventory/products')
        .set('Authorization', bearer(value))
        .expect(401);
  });

  it('loads Swagger and the exact public schema in development', async () => {
    await request(server).get('/docs').expect(200);
    await request(server).get('/api/inventory/openapi.json').expect(200);
    await request(server).get('/api/inventory/openapi.json/extra').expect(401);
    await request(server).post('/api/inventory/openapi.json').expect(404);
  });

  it('returns 502 for refused/reset connections and 504 for a stalled upstream', async () => {
    const purchases = token({ role: 'PURCHASES_AGENT', system: 'PURCHASES' });
    const unavailable = await request(server)
      .get('/api/purchases/orders')
      .set('Authorization', bearer(purchases))
      .expect(502);
    expect(JSON.parse(unavailable.text) as unknown).toMatchObject({
      source: 'gateway',
      statusCode: 502,
    });
    await request(server)
      .get('/api/inventory/reset')
      .set('Authorization', bearer(token()))
      .expect(502);
    await request(server)
      .get('/api/inventory/slow')
      .set('Authorization', bearer(token()))
      .expect(504);
  });

  it('preserves domain errors without relabeling their source', async () => {
    const response = await request(server)
      .get('/api/inventory/domain-error')
      .set('Authorization', bearer(token()))
      .expect(422);
    expect(JSON.parse(response.text) as unknown).toEqual({
      source: 'inventory',
      message: 'invalid',
    });
  });

  it('rejects oversized content-length and chunked requests', async () => {
    await request(server)
      .post('/api/inventory/products')
      .set('Authorization', bearer(token()))
      .send('x'.repeat(1025))
      .expect(413);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        `${baseUrl}/api/inventory/products`,
        {
          method: 'POST',
          headers: {
            Authorization: bearer(token()),
            'Transfer-Encoding': 'chunked',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.on('error', reject);
      req.write('x'.repeat(600));
      req.write('x'.repeat(600));
      req.end();
    });
    expect(status).toBe(413);
  });

  it('reuses proxies without accumulating server listeners', async () => {
    await request(server)
      .get('/api/inventory/products')
      .set('Authorization', bearer(token()))
      .expect(200);
    const before = server.listenerCount('close');
    for (let i = 0; i < 20; i++)
      await request(server)
        .get('/api/inventory/products')
        .set('Authorization', bearer(token()))
        .expect(200);
    expect(server.listenerCount('close')).toBe(before);
  });

  it('limits login attempts and exposes only gateway readiness', async () => {
    for (let i = 0; i < 9; i++)
      await request(server).post('/api/auth/login').send('{}').expect(200);
    await request(server).post('/api/auth/login').send('{}').expect(429);
    await request(server).get('/health/live').expect(200);
    const ready = await request(server).get('/health/ready').expect(200);
    expect(JSON.parse(ready.text) as unknown).toEqual({
      status: 'ready',
      scope: 'gateway',
    });
  });

  it('allows only configured browser origins', async () => {
    const allowed = await request(server)
      .get('/health/live')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    const other = await request(server)
      .get('/health/live')
      .set('Origin', 'https://other.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    expect(received.length).toBeGreaterThan(0);
  });
});
