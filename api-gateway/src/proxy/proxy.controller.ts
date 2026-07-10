import {
  All,
  Controller,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProxyController {
  constructor(private configService: ConfigService) {}

  @All('auth/*')
  proxyAuth(@Req() req: Request, @Res() res: Response) {
    return this.forward(req, res, this.configService.get<string>('AUTH_SERVICE_URL') || '');
  }

  @All('inventory/*')
  proxyInventory(@Req() req: Request, @Res() res: Response) {
    return this.forward(
      req,
      res,
      this.configService.get<string>('INVENTORY_SERVICE_URL') || '',
    );
  }

  @All('purchases/*')
  proxyPurchases(@Req() req: Request, @Res() res: Response) {
    return this.forward(
      req,
      res,
      this.configService.get<string>('PURCHASES_SERVICE_URL') || '',
    );
  }

  private forward(req: Request, res: Response, target: string) {
    const proxy = createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (path) => path, // mantiene el path tal cual
      on: {
        proxyReq: (proxyReq, req) => {
          // Reenvía los headers inyectados por el guard (x-user-id, x-user-roles)
          const request = req as Request;
          if (request.headers['x-user-id']) {
            proxyReq.setHeader('x-user-id', request.headers['x-user-id']);
          }
          if (request.headers['x-user-roles']) {
            proxyReq.setHeader(
              'x-user-roles',
              request.headers['x-user-roles'],
            );
          }
        },
      },
    });
    return proxy(req, res, () => {});
  }
}