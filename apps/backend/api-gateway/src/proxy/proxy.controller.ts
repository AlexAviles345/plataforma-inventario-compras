import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createProxyMiddleware,
  type RequestHandler,
} from 'http-proxy-middleware';
import { ConfigService } from '@nestjs/config';
import { ServerResponse } from 'node:http';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { sendGatewayError } from '../common/http-exception.filter';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class ProxyController {
  private readonly proxies: Record<string, RequestHandler<Request, Response>>;

  constructor(private readonly config: ConfigService) {
    this.proxies = Object.fromEntries(
      ['auth', 'inventory', 'purchases'].map((service) => [
        service,
        this.createProxy(service),
      ]),
    );
  }

  @All([
    'auth',
    'auth/{*path}',
    'inventory',
    'inventory/{*path}',
    'purchases',
    'purchases/{*path}',
  ])
  async forward(@Req() req: Request, @Res() res: Response): Promise<void> {
    const length = req.headers['content-length'];
    if (
      length &&
      Number(length) > this.config.getOrThrow<number>('MAX_BODY_BYTES')
    ) {
      sendGatewayError(res, 413, 'Cuerpo de petición demasiado grande');
      return;
    }
    await this.proxies[req.path.split('/')[2]](req, res, (error?: unknown) => {
      if (error) sendGatewayError(res, 502, 'No se pudo contactar al servicio');
    });
  }

  private createProxy(service: string): RequestHandler<Request, Response> {
    return createProxyMiddleware<Request, Response>({
      target: this.config.getOrThrow<string>(
        `${service.toUpperCase()}_SERVICE_URL`,
      ),
      changeOrigin: true,
      followRedirects: false,
      on: {
        proxyReq: (outgoing, incoming, response) => {
          const deadline = setTimeout(() => {
            sendGatewayError(
              response,
              504,
              'El servicio excedió el tiempo de espera',
            );
            outgoing.destroy();
          }, this.config.getOrThrow<number>('PROXY_TIMEOUT_MS'));
          let bytes = 0;
          const checkSize = (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > this.config.getOrThrow<number>('MAX_BODY_BYTES')) {
              sendGatewayError(
                response,
                413,
                'Cuerpo de petición demasiado grande',
              );
              outgoing.destroy();
            }
          };
          incoming.on('data', checkSize);
          response.once('close', () => {
            clearTimeout(deadline);
            incoming.removeListener('data', checkSize);
            if (!outgoing.destroyed) outgoing.destroy();
          });
          response.once('finish', () => clearTimeout(deadline));
        },
        error: (_error, _request, response) => {
          if (response instanceof ServerResponse)
            sendGatewayError(response, 502, 'No se pudo contactar al servicio');
        },
      },
    });
  }
}
