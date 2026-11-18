import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import type { Role, SystemCode } from '../access/access-matrix';
import { AuditAction, recordAudit } from '../audit/audit-log';
import { AuthDomainError, ErrorCode } from '../common/errors';
import { currentRequestId } from '../common/request-context';
import { TokenService, type IssuedToken } from './token.service';

const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface RefreshCredentials {
  refreshToken: string;
  csrfToken: string;
  maxAgeSeconds: number;
}

export interface RenewableSession {
  token: IssuedToken;
  credentials: RefreshCredentials;
}

interface SessionPrincipal {
  userId: string;
  email: string;
  role: Role;
  system: SystemCode;
}

interface RefreshRow {
  id: string;
  family_id: string;
  user_id: string;
  system_code: SystemCode;
  csrf_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
  email: string;
  active: boolean;
  role: Role | null;
  ttl: number;
}

type RotationResult =
  | {
      status: 'rotated';
      principal: SessionPrincipal;
      ttl: number;
      credentials: RefreshCredentials;
    }
  | { status: 'invalid' };

const hashSecret = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function safeTextEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left, 'utf8').digest();
  const rightHash = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftHash, rightHash);
}

function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

const invalidRefresh = () =>
  new AuthDomainError(
    401,
    ErrorCode.INVALID_REFRESH_TOKEN,
    'La sesión no es válida o ha expirado',
  );

const invalidCsrf = () =>
  new AuthDomainError(
    403,
    ErrorCode.CSRF_VALIDATION_FAILED,
    'No fue posible validar la solicitud',
  );

@Injectable()
export class RefreshSessionService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    config: ConfigService,
  ) {
    this.ttlSeconds = config.getOrThrow<number>('REFRESH_TOKEN_TTL_SECONDS');
  }

  async start(
    principal: SessionPrincipal,
    accessTokenTtl: number,
  ): Promise<RenewableSession> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1_000);
    const credentials = this.createCredentials(this.ttlSeconds);

    await this.dataSource.query(
      `INSERT INTO refresh_sessions
        (id, family_id, user_id, system_code, token_hash, csrf_hash,
         created_at, expires_at)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        principal.userId,
        principal.system,
        hashSecret(credentials.refreshToken),
        hashSecret(credentials.csrfToken),
        now,
        expiresAt,
      ],
    );

    return {
      token: await this.tokens.issue(principal, accessTokenTtl),
      credentials,
    };
  }

  async rotate(input: {
    refreshToken?: string;
    csrfCookie?: string;
    csrfHeader?: string;
  }): Promise<RenewableSession> {
    if (!input.refreshToken || !SECRET_PATTERN.test(input.refreshToken))
      throw invalidRefresh();
    const refreshToken = input.refreshToken;

    const rotation = await this.dataSource.transaction(
      async (manager): Promise<RotationResult> => {
        const [row] = await manager.query<RefreshRow[]>(
          `SELECT rs.id, rs.family_id, rs.user_id, rs.system_code,
                  rs.csrf_hash, rs.expires_at, rs.revoked_at,
                  rs.replaced_by_id, u.email, u.active, us.role,
                  s.access_token_ttl_seconds AS ttl
             FROM refresh_sessions rs
             JOIN users u ON u.id = rs.user_id
             JOIN systems s ON s.code = rs.system_code
             LEFT JOIN user_systems us
               ON us.user_id = rs.user_id
              AND us.system_code = rs.system_code
            WHERE rs.token_hash = $1
            FOR UPDATE OF rs`,
          [hashSecret(refreshToken)],
        );
        if (!row) return { status: 'invalid' };

        this.assertCsrf(row.csrf_hash, input.csrfCookie, input.csrfHeader);

        const now = new Date();
        if (row.revoked_at || row.replaced_by_id) {
          await this.revokeFamily(manager, row.family_id, now);
          await recordAudit(manager, {
            actorUserId: null,
            action: AuditAction.REFRESH_TOKEN_REUSE,
            targetType: 'USER',
            targetKey: row.user_id,
            targetVersion: null,
            requestId: currentRequestId() ?? randomUUID(),
            details: { familyId: row.family_id, system: row.system_code },
          });
          return { status: 'invalid' };
        }

        if (row.expires_at <= now || !row.active || !row.role) {
          await this.revokeFamily(manager, row.family_id, now);
          return { status: 'invalid' };
        }

        const successorId = randomUUID();
        const remainingSeconds = Math.max(
          1,
          Math.floor((row.expires_at.getTime() - now.getTime()) / 1_000),
        );
        const credentials = this.createCredentials(remainingSeconds);

        await manager.query(
          `INSERT INTO refresh_sessions
            (id, family_id, user_id, system_code, token_hash, csrf_hash,
             created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            successorId,
            row.family_id,
            row.user_id,
            row.system_code,
            hashSecret(credentials.refreshToken),
            hashSecret(credentials.csrfToken),
            now,
            row.expires_at,
          ],
        );
        await manager.query(
          `UPDATE refresh_sessions
              SET replaced_by_id = $2, last_used_at = $3
            WHERE id = $1`,
          [row.id, successorId, now],
        );

        return {
          status: 'rotated',
          principal: {
            userId: row.user_id,
            email: row.email,
            role: row.role,
            system: row.system_code,
          },
          ttl: this.tokens.effectiveTtl(row.ttl),
          credentials,
        };
      },
    );

    if (rotation.status === 'invalid') throw invalidRefresh();
    return {
      token: await this.tokens.issue(rotation.principal, rotation.ttl),
      credentials: rotation.credentials,
    };
  }

  async revoke(input: {
    refreshToken?: string;
    csrfCookie?: string;
    csrfHeader?: string;
  }): Promise<void> {
    if (!input.refreshToken || !SECRET_PATTERN.test(input.refreshToken)) return;

    await this.dataSource.transaction(async (manager) => {
      const [row] = await manager.query<
        Pick<RefreshRow, 'family_id' | 'csrf_hash'>[]
      >(
        `SELECT family_id, csrf_hash
           FROM refresh_sessions
          WHERE token_hash = $1
          FOR UPDATE`,
        [hashSecret(input.refreshToken!)],
      );
      if (!row) return;
      this.assertCsrf(row.csrf_hash, input.csrfCookie, input.csrfHeader);
      await this.revokeFamily(manager, row.family_id, new Date());
    });
  }

  private createCredentials(maxAgeSeconds: number): RefreshCredentials {
    return {
      refreshToken: newSecret(),
      csrfToken: newSecret(),
      maxAgeSeconds,
    };
  }

  private assertCsrf(
    expectedHash: string,
    cookie?: string,
    header?: string,
  ): void {
    if (
      !cookie ||
      !header ||
      !SECRET_PATTERN.test(cookie) ||
      !SECRET_PATTERN.test(header) ||
      !safeTextEqual(cookie, header) ||
      !safeTextEqual(hashSecret(header), expectedHash)
    )
      throw invalidCsrf();
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
    revokedAt: Date,
  ): Promise<void> {
    await manager.query(
      `UPDATE refresh_sessions
          SET revoked_at = COALESCE(revoked_at, $2)
        WHERE family_id = $1`,
      [familyId, revokedAt],
    );
  }
}
