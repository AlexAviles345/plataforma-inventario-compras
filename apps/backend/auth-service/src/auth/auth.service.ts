import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Role, SystemCode } from '../access/access-matrix';
import { AuthDomainError, ErrorCode } from '../common/errors';
import { PasswordHasher } from '../users/password-hasher';
import { normalizeEmail } from '../users/user-rules';
import {
  RefreshSessionService,
  type RenewableSession,
} from './refresh-session.service';
import { TokenService } from './token.service';

export interface LoginInput {
  email: string;
  password: string;
  system?: SystemCode;
}

interface LoginRow {
  id: string;
  email: string;
  password_hash: string;
  active: boolean;
  system_code: SystemCode | null;
  role: Role | null;
  ttl: number | null;
}

/** El mismo 401 para cualquier causa: no revela qué comprobación falló. */
const invalidCredentials = () =>
  new AuthDomainError(
    401,
    ErrorCode.INVALID_CREDENTIALS,
    'Credenciales inválidas',
  );

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash de una contraseña aleatoria para igualar el tiempo de respuesta. */
  private dummyHash = '';

  constructor(
    private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: RefreshSessionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomBytes(32).toString('hex'));
  }

  /**
   * Verifica contraseña, usuario activo y sus asignaciones de sistema.
   * Si se especifica `system`, exige asignación explícita a ese sistema.
   * Siempre ejecuta exactamente una verificación Argon2 (contra un hash
   * simulado si el email no existe) para no distinguir los casos por tiempo.
   */
  async login(input: LoginInput): Promise<RenewableSession> {
    const rows = await this.dataSource.query<LoginRow[]>(
      `SELECT u.id, u.email, u.password_hash, u.active,
              us.system_code, us.role, s.access_token_ttl_seconds AS ttl
         FROM users u
         LEFT JOIN user_systems us ON us.user_id = u.id
         LEFT JOIN systems s ON s.code = us.system_code
        WHERE u.email = $1
        ORDER BY s.code ASC`,
      [normalizeEmail(input.email)],
    );

    const userRow = rows[0];
    const passwordMatches = await this.hasher.verify(
      userRow?.password_hash ?? this.dummyHash,
      input.password,
    );

    const assignments = rows.flatMap((row) =>
      row.system_code && row.role && row.ttl !== null
        ? [{ system: row.system_code, role: row.role, ttl: row.ttl }]
        : [],
    );

    const primaryAssignment = input.system
      ? assignments.find((item) => item.system === input.system)
      : assignments[0];

    if (!userRow || !passwordMatches || !userRow.active || !primaryAssignment)
      throw invalidCredentials();

    return this.sessions.start(
      {
        userId: userRow.id,
        email: userRow.email,
        role: primaryAssignment.role,
        system: primaryAssignment.system,
      },
      this.tokens.effectiveTtl(primaryAssignment.ttl),
      assignments,
    );
  }

  refresh(input: {
    refreshToken?: string;
    csrfCookie?: string;
    csrfHeader?: string;
  }): Promise<RenewableSession> {
    return this.sessions.rotate(input);
  }

  logout(input: {
    refreshToken?: string;
    csrfCookie?: string;
    csrfHeader?: string;
  }): Promise<void> {
    return this.sessions.revoke(input);
  }
}
