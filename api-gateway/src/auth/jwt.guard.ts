import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isAccessTokenClaims } from './token-claims';
import { stripUntrustedHeaders } from '../common/request-context';

export const SCHEMA_PATHS = [
  '/api/auth/openapi.json',
  '/api/inventory/openapi.json',
  '/api/purchases/openapi.json',
];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // Never accept identity or forwarding assertions supplied by clients.
    stripUntrustedHeaders(request);
    if (request.method === 'POST' && request.path === '/api/auth/login')
      return true;
    if (SCHEMA_PATHS.includes(request.path)) {
      if (request.method === 'GET' && this.config.get<boolean>('DOCS_ENABLED'))
        return true;
      throw new NotFoundException();
    }
    const match = request.headers.authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) throw new UnauthorizedException('Token no proporcionado');
    let payload: unknown;
    try {
      payload = this.jwtService.verify<Record<string, unknown>>(match[1], {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        algorithms: ['HS256'],
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (
      !isAccessTokenClaims(
        payload,
        this.config.getOrThrow<number>('JWT_MAX_TTL_SECONDS'),
      )
    )
      throw new UnauthorizedException('Claims del token inválidos');
    const destination = request.path.split('/')[2];
    if (
      (destination === 'inventory' && payload.system !== 'INVENTORY') ||
      (destination === 'purchases' && payload.system !== 'PURCHASES')
    )
      throw new ForbiddenException('Token emitido para otro sistema');
    request.headers['x-user-id'] = payload.sub;
    request.headers['x-user-roles'] = JSON.stringify([payload.role]);
    request.headers['x-user-system'] = payload.system;
    return true;
  }
}
