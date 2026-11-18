import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createAuthApplication } from '../src/bootstrap';
import { UsersService } from '../src/users/users.service';

const PASSWORD = 'Sesion-Segura-2026';

interface TokenData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

interface Envelope<T = unknown> {
  error: boolean;
  statusCode: number;
  code?: string;
  data: T;
}

const body = <T = unknown>(response: request.Response) =>
  response.body as Envelope<T>;

function setCookies(response: request.Response): string[] {
  const value = response.headers['set-cookie'] as unknown;
  return Array.isArray(value) ? (value as string[]) : [String(value)];
}

function cookie(cookies: string[], name: string): string {
  const match = cookies.find((item) => item.startsWith(`${name}=`));
  if (!match) throw new Error(`No se recibió la cookie ${name}`);
  return match.split(';', 1)[0];
}

function cookieValue(pair: string): string {
  return pair.slice(pair.indexOf('=') + 1);
}

describe('Refresh sessions (HTTP)', () => {
  let app: NestExpressApplication;
  let server: Server;
  let users: UsersService;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createAuthApplication(AppModule);
    await app.init();
    server = app.getHttpServer();
    users = app.get(UsersService);
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await users.createUser(
      {
        email: 'sesion@techdistribution.com',
        displayName: 'Usuario de sesión',
        password: PASSWORD,
        assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
      },
      { actorUserId: null },
    );
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE users, user_systems, auth_audit_log, outbox_events CASCADE',
    );
  });

  afterAll(async () => app?.close());

  function login() {
    return request(server).post('/api/auth/login').send({
      email: 'sesion@techdistribution.com',
      password: PASSWORD,
      system: 'INVENTORY',
    });
  }

  function refresh(refreshCookie: string, csrfCookie: string) {
    return request(server)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie, csrfCookie])
      .set('X-CSRF-Token', cookieValue(csrfCookie));
  }

  it('stores only hashes and emits scoped cookies on login', async () => {
    const response = await login().expect(200);
    const cookies = setCookies(response);
    const refreshCookie = cookie(cookies, 'td_refresh');
    const csrfCookie = cookie(cookies, 'td_csrf');

    expect(body<TokenData>(response).data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(cookies.find((item) => item.startsWith('td_refresh='))).toContain(
      'HttpOnly',
    );
    expect(cookies.find((item) => item.startsWith('td_refresh='))).toContain(
      'Path=/api/auth',
    );
    expect(cookies.find((item) => item.startsWith('td_refresh='))).toContain(
      'SameSite=Strict',
    );
    expect(cookies.find((item) => item.startsWith('td_csrf='))).toContain(
      'Path=/',
    );
    expect(cookies.find((item) => item.startsWith('td_csrf='))).not.toContain(
      'HttpOnly',
    );

    const [row] = await dataSource.query<
      { token_hash: string; csrf_hash: string }[]
    >('SELECT token_hash, csrf_hash FROM refresh_sessions');
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.csrf_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.token_hash).not.toContain(cookieValue(refreshCookie));
    expect(row.csrf_hash).not.toContain(cookieValue(csrfCookie));
  });

  it('rotates refresh and CSRF tokens without extending absolute expiry', async () => {
    const loginResponse = await login();
    const loginCookies = setCookies(loginResponse);
    const oldRefresh = cookie(loginCookies, 'td_refresh');
    const oldCsrf = cookie(loginCookies, 'td_csrf');
    const [{ expires_at: originalExpiry }] = await dataSource.query<
      { expires_at: Date }[]
    >('SELECT expires_at FROM refresh_sessions');

    const response = await refresh(oldRefresh, oldCsrf).expect(200);
    const rotatedCookies = setCookies(response);
    expect(cookie(rotatedCookies, 'td_refresh')).not.toBe(oldRefresh);
    expect(cookie(rotatedCookies, 'td_csrf')).not.toBe(oldCsrf);
    expect(body<TokenData>(response).data.accessToken).toMatch(/^ey/);

    const rows = await dataSource.query<
      { expires_at: Date; replaced_by_id: string | null }[]
    >(
      'SELECT expires_at, replaced_by_id FROM refresh_sessions ORDER BY created_at',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].replaced_by_id).not.toBeNull();
    expect(rows[1].expires_at).toEqual(originalExpiry);
  });

  it('rejects missing CSRF proof and clears both cookies', async () => {
    const loginResponse = await login();
    const refreshCookie = cookie(setCookies(loginResponse), 'td_refresh');
    const response = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(403);

    expect(body(response).code).toBe('CSRF_VALIDATION_FAILED');
    const cleared = setCookies(response);
    expect(
      cleared.filter((item) => /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(item)),
    ).toHaveLength(2);
  });

  it('detects reuse, revokes the family and records a sanitized audit entry', async () => {
    const loginResponse = await login();
    const cookies = setCookies(loginResponse);
    const oldRefresh = cookie(cookies, 'td_refresh');
    const oldCsrf = cookie(cookies, 'td_csrf');
    await refresh(oldRefresh, oldCsrf).expect(200);

    const reused = await refresh(oldRefresh, oldCsrf).expect(401);
    expect(body(reused).code).toBe('INVALID_REFRESH_TOKEN');
    const [{ active }] = await dataSource.query<{ active: string }[]>(
      `SELECT count(*) FILTER (WHERE revoked_at IS NULL)::text AS active
         FROM refresh_sessions`,
    );
    expect(active).toBe('0');
    const [audit] = await dataSource.query<
      { action: string; details: Record<string, unknown> }[]
    >(
      `SELECT action, details FROM auth_audit_log
        WHERE action = 'REFRESH_TOKEN_REUSE'`,
    );
    expect(audit.action).toBe('REFRESH_TOKEN_REUSE');
    expect(JSON.stringify(audit.details)).not.toContain(
      cookieValue(oldRefresh),
    );
  });

  it('revokes the family on logout and remains idempotent', async () => {
    const loginResponse = await login();
    const cookies = setCookies(loginResponse);
    const refreshCookie = cookie(cookies, 'td_refresh');
    const csrfCookie = cookie(cookies, 'td_csrf');

    const logout = await request(server)
      .post('/api/auth/logout')
      .set('Cookie', [refreshCookie, csrfCookie])
      .set('X-CSRF-Token', cookieValue(csrfCookie))
      .expect(200);
    expect(setCookies(logout)).toHaveLength(2);
    await refresh(refreshCookie, csrfCookie).expect(401);
    await request(server).post('/api/auth/logout').expect(200);
  });
});
