import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Role, SystemCode } from '../access/access-matrix';
import { AuthDomainError, ErrorCode } from '../common/errors';
import { PasswordHasher } from '../users/password-hasher';
import { normalizeEmail } from '../users/user-rules';
import { TokenService, type IssuedToken } from './token.service';

export interface LoginInput {
  email: string;
  password: string;
  system: SystemCode;
}

interface LoginRow {
  id: string;
  email: string;
  password_hash: string;
  active: boolean;
  role: Role | null;
  ttl: number;
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
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomBytes(32).toString('hex'));
  }

  /**
   * Verifica contraseña, usuario activo y asignación explícita al sistema.
   * Siempre ejecuta exactamente una verificación Argon2 (contra un hash
   * simulado si el email no existe) para no distinguir los casos por tiempo.
   */
  async login(input: LoginInput): Promise<IssuedToken> {
    const [row] = await this.dataSource.query<LoginRow[]>(
      `SELECT u.id, u.email, u.password_hash, u.active, us.role,
              s.access_token_ttl_seconds AS ttl
         FROM users u
         JOIN systems s ON s.code = $2
         LEFT JOIN user_systems us
           ON us.user_id = u.id AND us.system_code = s.code
        WHERE u.email = $1`,
      [normalizeEmail(input.email), input.system],
    );

    const passwordMatches = await this.hasher.verify(
      row?.password_hash ?? this.dummyHash,
      input.password,
    );
    if (!row || !passwordMatches || !row.active || !row.role)
      throw invalidCredentials();

    return this.tokens.issue(
      {
        userId: row.id,
        email: row.email,
        role: row.role,
        system: input.system,
      },
      this.tokens.effectiveTtl(row.ttl),
    );
  }
}
