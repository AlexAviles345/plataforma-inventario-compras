import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role, SystemCode } from '../access/access-matrix';
import { AuthDomainError, ErrorCode } from '../common/errors';
import { isAccessTokenClaims, type AccessTokenClaims } from './token-claims';

export interface IssuedSystemToken {
  accessToken: string;
  tokenType: 'Bearer';
  /** Segundos; coincide exactamente con `exp - iat`. */
  expiresIn: number;
}

export interface IssuedToken extends IssuedSystemToken {
  tokens?: IssuedSystemToken[];
}

const invalidToken = () =>
  new AuthDomainError(
    401,
    ErrorCode.INVALID_TOKEN,
    'Token inválido o expirado',
    [],
    { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
  );

/**
 * Emite y valida access tokens HS256. El algoritmo, el emisor y la audiencia
 * nunca se toman del token: se fijan aquí desde la configuración compartida
 * con el Gateway.
 */
@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  readonly maxTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    this.issuer = config.getOrThrow<string>('JWT_ISSUER');
    this.audience = config.getOrThrow<string>('JWT_AUDIENCE');
    this.maxTtlSeconds = config.getOrThrow<number>('JWT_MAX_TTL_SECONDS');
  }

  /** El TTL del sistema nunca supera `JWT_MAX_TTL_SECONDS`. */
  effectiveTtl(systemTtlSeconds: number): number {
    return Math.min(systemTtlSeconds, this.maxTtlSeconds);
  }

  async issue(
    subject: { userId: string; email: string; role: Role; system: SystemCode },
    ttlSeconds: number,
  ): Promise<IssuedToken> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: subject.userId,
        email: subject.email,
        role: subject.role,
        system: subject.system,
      },
      {
        secret: this.secret,
        algorithm: 'HS256',
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: ttlSeconds,
      },
    );
    return { accessToken, tokenType: 'Bearer', expiresIn: ttlSeconds };
  }

  /** Firma, algoritmo, emisor, audiencia y claims; cualquier fallo es 401. */
  async verify(token: string): Promise<AccessTokenClaims> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      });
    } catch {
      throw invalidToken();
    }
    if (!isAccessTokenClaims(payload, this.maxTtlSeconds)) throw invalidToken();
    return payload;
  }
}
