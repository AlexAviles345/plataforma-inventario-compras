import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createAuthApplication } from '../src/bootstrap';
import { UsersService, type UserView } from '../src/users/users.service';

const PASSWORD = 'Admin-Seguro-2026';

interface Envelope<T = unknown> {
  error: boolean;
  statusCode: number;
  code?: string;
  message: string;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  details?: { field?: string; code: string; message: string }[];
}

interface UserBody {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  version: number;
  assignments: { system: string; role: string }[];
  createdAt: string;
  updatedAt: string;
}

interface SystemBody {
  code: string;
  accessTokenTtlSeconds: number;
  maxAccessTokenTtlSeconds: number;
  version: number;
  updatedAt: string;
}

const body = <T = unknown>(response: request.Response) =>
  response.body as Envelope<T>;

const fields = (response: request.Response) =>
  (body(response).details ?? []).map(({ field, code }) => `${field}:${code}`);

describe('Admin endpoints (HTTP)', () => {
  let app: NestExpressApplication;
  let server: Server;
  let users: UsersService;
  let dataSource: DataSource;
  let admin: UserView;
  let adminToken: string;
  let managerToken: string;

  const login = async (email: string, system = 'INVENTORY') => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD, system });
    expect(response.status).toBe(200);
    return body<{ accessToken: string }>(response).data.accessToken;
  };

  const as = (token: string) => ({
    get: (url: string) =>
      request(server).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      request(server).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) =>
      request(server).put(url).set('Authorization', `Bearer ${token}`),
  });

  const newUser = (overrides: Record<string, unknown> = {}) => ({
    email: 'nuevo@techdistribution.com',
    displayName: 'Usuario nuevo',
    password: PASSWORD,
    assignments: [{ system: 'PURCHASES', role: 'PURCHASES_AGENT' }],
    ...overrides,
  });

  beforeAll(async () => {
    app = await createAuthApplication(AppModule);
    await app.init();
    server = app.getHttpServer();
    users = app.get(UsersService);
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    admin = await users.createUser(
      {
        email: 'admin@techdistribution.com',
        displayName: 'Administrador',
        password: PASSWORD,
        assignments: [
          { system: 'INVENTORY', role: 'ADMIN' },
          { system: 'PURCHASES', role: 'ADMIN' },
        ],
      },
      { actorUserId: null },
    );
    await users.createUser(
      {
        email: 'gestor@techdistribution.com',
        displayName: 'Gestor',
        password: PASSWORD,
        assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
      },
      { actorUserId: null },
    );
    adminToken = await login('admin@techdistribution.com');
    managerToken = await login('gestor@techdistribution.com');
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
    await dataSource.query(
      'UPDATE systems SET access_token_ttl_seconds = 900, version = 1',
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each([
    ['POST', '/api/auth/users'],
    ['GET', '/api/auth/users'],
    ['GET', `/api/auth/users/${randomUUID()}`],
    ['PUT', `/api/auth/users/${randomUUID()}`],
    ['GET', '/api/auth/systems'],
    ['PUT', '/api/auth/systems/INVENTORY'],
  ])('%s %s', (method, url) => {
    const call = () =>
      method === 'GET'
        ? request(server).get(url)
        : method === 'POST'
          ? request(server).post(url).send({})
          : request(server).put(url).send({});

    it('requires a token', async () => {
      const response = await call();
      expect(response.status).toBe(401);
      expect(body(response).code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('forbids non-admin tokens', async () => {
      const response = await call().set(
        'Authorization',
        `Bearer ${managerToken}`,
      );
      expect(response.status).toBe(403);
      expect(body(response).code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/auth/users', () => {
    it('creates the user, returns 201 with Location and audits the admin as actor', async () => {
      const response = await as(adminToken)
        .post('/api/auth/users')
        .send(newUser({ email: ' Nuevo@TechDistribution.com ' }));

      expect(response.status).toBe(201);
      const created = body<UserBody>(response);
      expect(created).toMatchObject({
        error: false,
        statusCode: 201,
        message: 'Usuario creado exitosamente',
        data: {
          email: 'nuevo@techdistribution.com',
          displayName: 'Usuario nuevo',
          active: true,
          version: 1,
          assignments: [{ system: 'PURCHASES', role: 'PURCHASES_AGENT' }],
        },
      });
      expect(response.headers.location).toBe(
        `/api/auth/users/${created.data.id}`,
      );
      expect(Object.keys(created.data).sort()).toEqual([
        'active',
        'assignments',
        'createdAt',
        'displayName',
        'email',
        'id',
        'updatedAt',
        'version',
      ]);

      const [audit] = await dataSource.query<
        { actor_user_id: string; request_id: string }[]
      >(
        `SELECT actor_user_id, request_id FROM auth_audit_log WHERE target_key = $1`,
        [created.data.id],
      );
      expect(audit.actor_user_id).toBe(admin.id);
      expect(audit.request_id).toBe(response.headers['x-request-id']);
    });

    it('reports DTO and domain validation with client paths', async () => {
      const response = await as(adminToken)
        .post('/api/auth/users')
        .send(
          newUser({
            displayName: undefined,
            assignments: [{ system: 'INVENTORY', role: 7 }],
          }),
        );
      expect(response.status).toBe(400);
      expect(fields(response)).toEqual(
        expect.arrayContaining([
          'displayName:IS_STRING',
          'assignments[0].role:IS_STRING',
        ]),
      );

      const domain = await as(adminToken)
        .post('/api/auth/users')
        .send(
          newUser({
            email: 'no-es-email',
            password: 'qwertyuiop',
            assignments: [{ system: 'INVENTORY', role: 'PURCHASES_AGENT' }],
          }),
        );
      expect(domain.status).toBe(400);
      expect(fields(domain)).toEqual([
        'email:INVALID_EMAIL',
        'password:COMMON_PASSWORD',
        'assignments[0].role:ROLE_NOT_ALLOWED_FOR_SYSTEM',
      ]);
      expect(JSON.stringify(domain.body)).not.toContain('qwertyuiop');
    });

    it('rejects undeclared fields such as passwordHash or version', async () => {
      const response = await as(adminToken)
        .post('/api/auth/users')
        .send(newUser({ passwordHash: 'x', version: 9 }));
      expect(response.status).toBe(400);
      expect(fields(response)).toEqual([
        'passwordHash:UNKNOWN_FIELD',
        'version:UNKNOWN_FIELD',
      ]);
    });

    it('rejects a duplicated email with 409', async () => {
      const response = await as(adminToken)
        .post('/api/auth/users')
        .send(newUser({ email: 'GESTOR@techdistribution.com' }));
      expect(response.status).toBe(409);
      expect(body(response).code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('GET /api/auth/users', () => {
    it('paginates by email and never exposes the hash', async () => {
      for (const name of ['carla', 'beto', 'diana'])
        await users.createUser(
          {
            email: `${name}@techdistribution.com`,
            displayName: name,
            password: PASSWORD,
            assignments: [],
          },
          { actorUserId: admin.id },
        );

      const first = await as(adminToken).get('/api/auth/users?page=1&limit=2');
      expect(first.status).toBe(200);
      expect(body(first).meta).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
      expect(body<UserBody[]>(first).data.map((u) => u.email)).toEqual([
        'admin@techdistribution.com',
        'beto@techdistribution.com',
      ]);
      expect(body<UserBody[]>(first).data[0].assignments).toEqual([
        { system: 'INVENTORY', role: 'ADMIN' },
        { system: 'PURCHASES', role: 'ADMIN' },
      ]);

      const last = await as(adminToken).get('/api/auth/users?page=3&limit=2');
      expect(body<UserBody[]>(last).data.map((u) => u.email)).toEqual([
        'gestor@techdistribution.com',
      ]);
      expect(JSON.stringify([first.body, last.body])).not.toMatch(
        /argon2|password/i,
      );
    });

    it('uses page 1 and limit 20 by default and validates the query', async () => {
      const response = await as(adminToken).get('/api/auth/users');
      expect(body(response).meta).toMatchObject({ page: 1, limit: 20 });
      const invalid = await as(adminToken).get('/api/auth/users?limit=101');
      expect(invalid.status).toBe(400);
      expect(fields(invalid)).toEqual(['limit:MAX']);
    });
  });

  describe('GET /api/auth/users/:id', () => {
    it('returns the user', async () => {
      const response = await as(adminToken).get(`/api/auth/users/${admin.id}`);
      expect(response.status).toBe(200);
      expect(body<UserBody>(response).data).toMatchObject({
        id: admin.id,
        email: 'admin@techdistribution.com',
      });
    });

    it.each([randomUUID(), 'no-es-uuid'])('returns 404 for %p', async (id) => {
      const response = await as(adminToken).get(`/api/auth/users/${id}`);
      expect(response.status).toBe(404);
      expect(body(response).code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('PUT /api/auth/users/:id', () => {
    const put = (id: string, payload: Record<string, unknown>) =>
      as(adminToken).put(`/api/auth/users/${id}`).send(payload);

    it('updates with expectedVersion and returns the new version', async () => {
      const created = await users.createUser(newUser(), { actorUserId: null });
      const response = await put(created.id, {
        expectedVersion: 1,
        displayName: 'Renombrado',
        assignments: [
          { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
          { system: 'INVENTORY', role: 'INVENTORY_MANAGER' },
        ],
      });
      expect(response.status).toBe(200);
      expect(body(response)).toMatchObject({
        message: 'Usuario actualizado exitosamente',
        data: {
          displayName: 'Renombrado',
          version: 2,
          assignments: [
            { system: 'INVENTORY', role: 'INVENTORY_MANAGER' },
            { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
          ],
        },
      });
    });

    it('answers a stale version with 409 VERSION_CONFLICT', async () => {
      const created = await users.createUser(newUser(), { actorUserId: null });
      await put(created.id, { expectedVersion: 1, active: false });
      const response = await put(created.id, {
        expectedVersion: 1,
        active: true,
      });
      expect(response.status).toBe(409);
      expect(body(response).code).toBe('VERSION_CONFLICT');
    });

    it('refuses to deactivate the last active ADMIN', async () => {
      const response = await put(admin.id, {
        expectedVersion: 1,
        active: false,
      });
      expect(response.status).toBe(409);
      expect(body(response).code).toBe('LAST_ACTIVE_ADMIN');
    });

    it.each<[string, Record<string, unknown>, string[]]>([
      [
        'a missing expectedVersion',
        { active: false },
        ['expectedVersion:IS_INT', 'expectedVersion:MIN'],
      ],
      [
        'a string boolean',
        { expectedVersion: 1, active: 'false' },
        ['active:IS_BOOLEAN'],
      ],
      [
        'three assignments',
        {
          expectedVersion: 1,
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'ADMIN' },
            { system: 'INVENTORY', role: 'ADMIN' },
          ],
        },
        ['assignments:ARRAY_MAX_SIZE'],
      ],
    ])('rejects %s with 400', async (_case, payload, expected) => {
      const response = await put(admin.id, payload);
      expect(response.status).toBe(400);
      expect(fields(response).sort()).toEqual([...expected].sort());
    });

    it('returns 404 for an unknown user', async () => {
      const response = await put(randomUUID(), {
        expectedVersion: 1,
        active: false,
      });
      expect(response.status).toBe(404);
    });
  });

  describe('systems', () => {
    it('lists both systems with their TTL and the configured maximum', async () => {
      const response = await as(adminToken).get('/api/auth/systems');
      expect(response.status).toBe(200);
      expect(body<SystemBody[]>(response).data).toEqual([
        expect.objectContaining({
          code: 'INVENTORY',
          accessTokenTtlSeconds: 900,
          maxAccessTokenTtlSeconds: 900,
          version: 1,
        }),
        expect.objectContaining({ code: 'PURCHASES', version: 1 }),
      ]);
    });

    it('changes the TTL for future logins and audits it', async () => {
      const response = await as(adminToken)
        .put('/api/auth/systems/PURCHASES')
        .send({ expectedVersion: 1, accessTokenTtlSeconds: 600 });
      expect(response.status).toBe(200);
      expect(body<SystemBody>(response).data).toMatchObject({
        code: 'PURCHASES',
        accessTokenTtlSeconds: 600,
        version: 2,
      });

      const login = await request(server).post('/api/auth/login').send({
        email: 'admin@techdistribution.com',
        password: PASSWORD,
        system: 'PURCHASES',
      });
      expect(body<{ expiresIn: number }>(login).data.expiresIn).toBe(600);

      const [audit] = await dataSource.query<Record<string, unknown>[]>(
        `SELECT actor_user_id, action, target_key, target_version, details
           FROM auth_audit_log WHERE target_type = 'SYSTEM'`,
      );
      expect(audit).toEqual({
        actor_user_id: admin.id,
        action: 'SYSTEM_UPDATED',
        target_key: 'PURCHASES',
        target_version: '2',
        details: {
          previousAccessTokenTtlSeconds: 900,
          accessTokenTtlSeconds: 600,
        },
      });
    });

    it.each([0, 901, 3600])(
      'rejects a TTL of %p seconds outside 1..JWT_MAX_TTL_SECONDS',
      async (ttl) => {
        const response = await as(adminToken)
          .put('/api/auth/systems/INVENTORY')
          .send({ expectedVersion: 1, accessTokenTtlSeconds: ttl });
        expect(response.status).toBe(400);
        expect(fields(response)).toEqual([
          'accessTokenTtlSeconds:OUT_OF_RANGE',
        ]);
      },
    );

    it('answers a stale version with 409 and an unknown code with 404', async () => {
      await as(adminToken)
        .put('/api/auth/systems/INVENTORY')
        .send({ expectedVersion: 1, accessTokenTtlSeconds: 600 });
      const stale = await as(adminToken)
        .put('/api/auth/systems/INVENTORY')
        .send({ expectedVersion: 1, accessTokenTtlSeconds: 300 });
      expect(stale.status).toBe(409);
      expect(body(stale).code).toBe('VERSION_CONFLICT');

      const unknown = await as(adminToken)
        .put('/api/auth/systems/BILLING')
        .send({ expectedVersion: 1, accessTokenTtlSeconds: 300 });
      expect(unknown.status).toBe(404);
    });
  });

  describe('OpenAPI', () => {
    it('documents every admin path with the envelope and error examples', async () => {
      const response = await request(server).get('/api/auth/openapi.json');
      const document = response.body as {
        servers: { url: string }[];
        paths: Record<string, Record<string, Record<string, unknown>>>;
      };
      expect(document.servers).toEqual([{ url: '/' }]);
      expect(Object.keys(document.paths)).toEqual(
        expect.arrayContaining([
          '/api/auth/login',
          '/api/auth/users',
          '/api/auth/users/{id}',
          '/api/auth/systems',
          '/api/auth/systems/{code}',
        ]),
      );
      const put = JSON.stringify(document.paths['/api/auth/users/{id}'].put);
      for (const code of [
        'VALIDATION_ERROR',
        'AUTHENTICATION_REQUIRED',
        'INVALID_TOKEN',
        'FORBIDDEN',
        'RESOURCE_NOT_FOUND',
        'VERSION_CONFLICT',
        'EMAIL_ALREADY_EXISTS',
        'LAST_ACTIVE_ADMIN',
      ])
        expect(put).toContain(`"${code}"`);
      const list = JSON.stringify(document.paths['/api/auth/users'].get);
      expect(list).toContain('PaginationMetaDto');
      expect(list).toContain('UserResponseDto');
    });
  });
});
