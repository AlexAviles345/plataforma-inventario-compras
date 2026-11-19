import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  AdminGuard,
  CurrentPrincipal,
  type Principal,
} from '../src/auth/admin.guard';
import { AuthModule } from '../src/auth/auth.module';
import { createAuthApplication } from '../src/bootstrap';
import { PasswordHasher } from '../src/users/password-hasher';
import {
  UsersService,
  type CreateUserInput,
  type UserView,
} from '../src/users/users.service';

/** Ruta administrativa de prueba hasta que existan las de la fase 5. */
@Controller('probe-admin')
class ProbeAdminController {
  @Get()
  @UseGuards(AdminGuard)
  whoami(@CurrentPrincipal() principal: Principal) {
    return principal;
  }
}

@Module({
  imports: [AppModule, AuthModule],
  controllers: [ProbeAdminController],
})
class ProbeModule {}

const SECRET = process.env.JWT_SECRET as string;
const PASSWORD = 'Login-Seguro-2026';

interface TokenData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  tokens?: Array<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  }>;
}

interface Envelope<T = unknown> {
  error: boolean;
  statusCode: number;
  code?: string;
  message: string;
  data: T;
  timestamp?: string;
}

const body = <T = unknown>(response: request.Response) =>
  response.body as Envelope<T>;

const decode = (token: string) => {
  const [header, payload] = token
    .split('.')
    .slice(0, 2)
    .map(
      (part) =>
        JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<
          string,
          unknown
        >,
    );
  return { header, payload };
};

describe('Login and admin authorization (HTTP)', () => {
  let app: NestExpressApplication;
  let server: Server;
  let users: UsersService;
  let dataSource: DataSource;
  const jwt = new JwtService();

  const createUser = (overrides: Partial<CreateUserInput>) =>
    users.createUser(
      {
        email: 'usuario@techdistribution.com',
        displayName: 'Usuario',
        password: PASSWORD,
        assignments: [],
        ...overrides,
      },
      { actorUserId: null },
    );

  const login = (payload: Record<string, unknown>) =>
    request(server).post('/api/auth/login').send(payload);

  const tokenFor = async (email: string, system: string) => {
    const response = await login({ email, password: PASSWORD, system });
    expect(response.status).toBe(200);
    return body<TokenData>(response).data.accessToken;
  };

  const sign = (
    overrides: Record<string, unknown> = {},
    options: Record<string, unknown> = {},
  ) =>
    jwt.sign(
      {
        sub: admin.id,
        email: admin.email,
        role: 'ADMIN',
        system: 'INVENTORY',
        ...overrides,
      },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: 'techdistribution-auth',
        audience: 'techdistribution-api',
        expiresIn: 900,
        ...options,
      },
    );

  const probe = (authorization?: string) => {
    const call = request(server).get('/api/auth/probe-admin');
    return authorization ? call.set('Authorization', authorization) : call;
  };

  let admin: UserView;
  let manager: UserView;

  beforeAll(async () => {
    app = await createAuthApplication(ProbeModule);
    await app.init();
    server = app.getHttpServer();
    users = app.get(UsersService);
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    admin = await createUser({
      email: 'admin@techdistribution.com',
      assignments: [
        { system: 'INVENTORY', role: 'ADMIN' },
        { system: 'PURCHASES', role: 'ADMIN' },
      ],
    });
    manager = await createUser({
      email: 'gestor@techdistribution.com',
      assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
    await dataSource.query('UPDATE systems SET access_token_ttl_seconds = 900');
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /api/auth/login', () => {
    it('issues an HS256 token with every claim of the contract', async () => {
      const before = Math.floor(Date.now() / 1000);
      const response = await login({
        email: ' Gestor@TechDistribution.com ',
        password: PASSWORD,
        system: 'INVENTORY',
      });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(body(response)).toMatchObject({
        error: false,
        statusCode: 200,
        message: 'Inicio de sesión exitoso',
        data: { tokenType: 'Bearer', expiresIn: 900 },
      });

      const { header, payload } = decode(
        body<TokenData>(response).data.accessToken,
      );
      expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(payload).toEqual({
        sub: manager.id,
        email: 'gestor@techdistribution.com',
        role: 'INVENTORY_MANAGER',
        system: 'INVENTORY',
        iat: expect.any(Number) as unknown,
        exp: expect.any(Number) as unknown,
        iss: 'techdistribution-auth',
        aud: 'techdistribution-api',
      });
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect((payload.exp as number) - (payload.iat as number)).toBe(900);
    });

    it('issues the role assigned for the requested system', async () => {
      await users.updateUser(
        admin.id,
        {
          expectedVersion: 1,
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
          ],
        },
        { actorUserId: null },
      );
      const inventory = decode(
        await tokenFor('admin@techdistribution.com', 'INVENTORY'),
      );
      const purchases = decode(
        await tokenFor('admin@techdistribution.com', 'PURCHASES'),
      );
      expect(inventory.payload).toMatchObject({
        role: 'ADMIN',
        system: 'INVENTORY',
      });
      expect(purchases.payload).toMatchObject({
        role: 'PURCHASES_AGENT',
        system: 'PURCHASES',
      });
    });

    it('issues tokens for every assigned system when system is omitted', async () => {
      const adminResponse = await login({
        email: 'admin@techdistribution.com',
        password: PASSWORD,
      }).expect(200);

      const adminData = body<TokenData>(adminResponse).data;
      expect(adminData.tokens).toHaveLength(2);
      const adminClaims = (adminData.tokens ?? []).map(
        (entry) => decode(entry.accessToken).payload,
      );
      expect(adminClaims).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'ADMIN', system: 'INVENTORY' }),
          expect.objectContaining({ role: 'ADMIN', system: 'PURCHASES' }),
        ]),
      );

      const managerResponse = await login({
        email: 'gestor@techdistribution.com',
        password: PASSWORD,
      }).expect(200);
      const managerData = body<TokenData>(managerResponse).data;
      expect(managerData.tokens).toHaveLength(1);
      expect(decode(managerData.tokens![0].accessToken).payload).toMatchObject({
        role: 'INVENTORY_MANAGER',
        system: 'INVENTORY',
      });
    });

    it('uses the system TTL, capped by JWT_MAX_TTL_SECONDS', async () => {
      await dataSource.query(
        `UPDATE systems SET access_token_ttl_seconds = 300 WHERE code = 'INVENTORY'`,
      );
      await dataSource.query(
        `UPDATE systems SET access_token_ttl_seconds = 3600 WHERE code = 'PURCHASES'`,
      );

      const short = await login({
        email: 'admin@techdistribution.com',
        password: PASSWORD,
        system: 'INVENTORY',
      });
      const capped = await login({
        email: 'admin@techdistribution.com',
        password: PASSWORD,
        system: 'PURCHASES',
      });
      expect(body<TokenData>(short).data.expiresIn).toBe(300);
      expect(body<TokenData>(capped).data.expiresIn).toBe(900);
      const { payload } = decode(body<TokenData>(capped).data.accessToken);
      expect((payload.exp as number) - (payload.iat as number)).toBe(900);
    });

    it('answers every credential failure with the same 401', async () => {
      await createUser({
        email: 'inactivo@techdistribution.com',
        assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
      }).then((user) =>
        users.updateUser(
          user.id,
          { expectedVersion: 1, active: false },
          { actorUserId: null },
        ),
      );

      const attempts = [
        { email: 'gestor@techdistribution.com', password: 'Incorrecta-123' },
        { email: 'nadie@techdistribution.com', password: PASSWORD },
        { email: 'inactivo@techdistribution.com', password: PASSWORD },
        { email: 'no-es-un-email', password: PASSWORD },
      ].map((credentials) => ({ ...credentials, system: 'INVENTORY' }));
      // Usuario válido sin asignación al sistema solicitado.
      attempts.push({
        email: 'gestor@techdistribution.com',
        password: PASSWORD,
        system: 'PURCHASES',
      });

      for (const attempt of attempts) {
        const response = await login(attempt);
        expect(response.status).toBe(401);
        const { timestamp, ...rest } = body(response);
        expect(timestamp).toEqual(expect.any(String));
        expect(rest).toEqual({
          error: true,
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Credenciales inválidas',
          source: 'auth',
        });
      }
    });

    it('runs one Argon2 verification even when the user does not exist', async () => {
      const verify = jest.spyOn(PasswordHasher.prototype, 'verify');
      await login({
        email: 'nadie@techdistribution.com',
        password: PASSWORD,
        system: 'INVENTORY',
      });
      expect(verify).toHaveBeenCalledTimes(1);
      const [hash] = verify.mock.calls[0];
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['an unknown system', { system: 'BILLING' }, 'system'],
      ['a missing password', { password: undefined }, 'password'],
      [
        'a password above 128 characters',
        { password: 'x'.repeat(129) },
        'password',
      ],
      ['an undeclared field', { role: 'ADMIN' }, 'role'],
    ])('rejects %s with 400', async (_case, overrides, field) => {
      const response = await login({
        email: 'gestor@techdistribution.com',
        password: PASSWORD,
        system: 'INVENTORY',
        ...overrides,
      });
      expect(response.status).toBe(400);
      expect(body(response)).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(JSON.stringify(response.body)).toContain(`"field":"${field}"`);
    });
  });

  describe('AdminGuard', () => {
    it('accepts an ADMIN token from either system and exposes the principal', async () => {
      for (const system of ['INVENTORY', 'PURCHASES']) {
        const token = await tokenFor('admin@techdistribution.com', system);
        const response = await probe(`Bearer ${token}`);
        expect(response.status).toBe(200);
        expect(body(response).data).toEqual({
          userId: admin.id,
          email: 'admin@techdistribution.com',
          role: 'ADMIN',
          system,
        });
      }
    });

    it('requires a token', async () => {
      const response = await probe();
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(body(response).code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('ignores tokens outside the Authorization header', async () => {
      const token = await tokenFor('admin@techdistribution.com', 'INVENTORY');
      const response = await request(server)
        .get(`/api/auth/probe-admin?access_token=${token}`)
        .set('Cookie', `access_token=${token}`);
      expect(response.status).toBe(401);
    });

    it('forbids valid tokens without the ADMIN role', async () => {
      const token = await tokenFor('gestor@techdistribution.com', 'INVENTORY');
      const response = await probe(`Bearer ${token}`);
      expect(response.status).toBe(403);
      expect(body(response).code).toBe('FORBIDDEN');
    });

    it('does not trust x-user-* headers', async () => {
      const token = await tokenFor('gestor@techdistribution.com', 'INVENTORY');
      const response = await probe(`Bearer ${token}`)
        .set('x-user-id', admin.id)
        .set('x-user-roles', '["ADMIN"]');
      expect(response.status).toBe(403);
    });

    const unsigned = (payload: Record<string, unknown>) =>
      [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
          'base64url',
        ),
        Buffer.from(JSON.stringify(payload)).toString('base64url'),
        '',
      ].join('.');

    it.each<[string, () => string]>([
      ['a malformed header', () => 'Token abc'],
      ['a non-JWT bearer', () => 'Bearer abc'],
      [
        'another secret',
        () =>
          `Bearer ${jwt.sign({ sub: admin.id }, { secret: 'otro-secreto-de-mas-de-32-bytes-0000' })}`,
      ],
      ['another issuer', () => `Bearer ${sign({}, { issuer: 'evil' })}`],
      ['another audience', () => `Bearer ${sign({}, { audience: 'evil' })}`],
      ['HS512', () => `Bearer ${sign({}, { algorithm: 'HS512' })}`],
      [
        'an expired token',
        () =>
          `Bearer ${sign({ iat: Math.floor(Date.now() / 1000) - 1000 }, { expiresIn: 60 })}`,
      ],
      [
        'a TTL above the maximum',
        () => `Bearer ${sign({}, { expiresIn: 901 })}`,
      ],
      [
        'a role outside the matrix',
        () =>
          `Bearer ${sign({ role: 'PURCHASES_AGENT', system: 'INVENTORY' })}`,
      ],
      [
        'alg none',
        () =>
          `Bearer ${unsigned({ sub: admin.id, role: 'ADMIN', system: 'INVENTORY', iss: 'techdistribution-auth', aud: 'techdistribution-api', exp: Math.floor(Date.now() / 1000) + 600 })}`,
      ],
    ])('rejects %s with 401 INVALID_TOKEN', async (_case, authorization) => {
      const response = await probe(authorization());
      expect(response.status).toBe(401);
      expect(body(response).code).toBe('INVALID_TOKEN');
    });

    it('rejects a still-valid token once the admin is deactivated', async () => {
      const token = await tokenFor('admin@techdistribution.com', 'INVENTORY');
      await createUser({
        email: 'otro-admin@techdistribution.com',
        assignments: [{ system: 'INVENTORY', role: 'ADMIN' }],
      });
      await users.updateUser(
        admin.id,
        { expectedVersion: 1, active: false },
        { actorUserId: null },
      );
      const response = await probe(`Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(body(response).code).toBe('INVALID_TOKEN');
    });

    it('forbids an admin token after the role is removed on that system', async () => {
      const token = await tokenFor('admin@techdistribution.com', 'PURCHASES');
      await users.updateUser(
        admin.id,
        {
          expectedVersion: 1,
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
          ],
        },
        { actorUserId: null },
      );
      expect((await probe(`Bearer ${token}`)).status).toBe(403);
    });
  });
});
