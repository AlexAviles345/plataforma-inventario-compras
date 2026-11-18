import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import type { Role, SystemCode } from '../access/access-matrix';
import { AuthDomainError, ErrorCode } from '../common/errors';
import { TokenService } from './token.service';

/** Identidad autenticada de la petición, derivada del token ya validado. */
export interface Principal {
  userId: string;
  email: string;
  role: Role;
  system: SystemCode;
}

type AuthenticatedRequest = Request & { principal?: Principal };

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

const forbidden = () =>
  new AuthDomainError(
    403,
    ErrorCode.FORBIDDEN,
    'Se requiere rol ADMIN para esta operación',
  );

/**
 * Protege las rutas administrativas de Auth. No confía en los headers
 * `x-user-*` del Gateway: revalida el JWT del header Authorization y exige
 * `role: ADMIN` (de cualquiera de los dos sistemas). Como Auth es dueño de los
 * usuarios, además comprueba que el usuario siga activo y conserve el rol ADMIN
 * en ese sistema, así una desactivación surte efecto de inmediato aquí.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header)
      throw new AuthDomainError(
        401,
        ErrorCode.AUTHENTICATION_REQUIRED,
        'Token no proporcionado',
        [],
        { 'WWW-Authenticate': 'Bearer' },
      );
    const match = BEARER.exec(header);
    if (!match)
      throw new AuthDomainError(
        401,
        ErrorCode.INVALID_TOKEN,
        'Token inválido o expirado',
        [],
        { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
      );

    const claims = await this.tokens.verify(match[1]);
    if (claims.role !== 'ADMIN') throw forbidden();

    const [state] = await this.dataSource.query<
      { active: boolean; admin: boolean }[]
    >(
      `SELECT u.active, EXISTS (
         SELECT 1 FROM user_systems us
          WHERE us.user_id = u.id AND us.system_code = $2 AND us.role = 'ADMIN'
       ) AS admin
         FROM users u WHERE u.id = $1`,
      [claims.sub, claims.system],
    );
    if (!state?.active)
      throw new AuthDomainError(
        401,
        ErrorCode.INVALID_TOKEN,
        'Token inválido o expirado',
        [],
        { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
      );
    if (!state.admin) throw forbidden();

    request.principal = {
      userId: claims.sub,
      email: claims.email,
      role: claims.role,
      system: claims.system,
    };
    return true;
  }
}

/** Inyecta el `Principal` establecido por `AdminGuard`. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const { principal } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!principal)
      throw new Error('CurrentPrincipal requiere AdminGuard en la ruta');
    return principal;
  },
);
