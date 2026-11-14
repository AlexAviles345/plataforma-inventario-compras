import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { SkipEnvelope } from './common/api-response';

interface HealthResponse {
  status: 'ok' | 'ready' | 'unavailable';
  service: 'auth-service';
}

const READY_TIMEOUT_MS = 2_000;

@ApiTags('health')
@SkipEnvelope()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('live')
  @ApiOkResponse({ description: 'El proceso del servicio está activo.' })
  live(): HealthResponse {
    return { status: 'ok', service: 'auth-service' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'El servicio y PostgreSQL responden.' })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL no responde.' })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    if (await this.databaseResponds())
      return { status: 'ready', service: 'auth-service' };
    response.status(503);
    return { status: 'unavailable', service: 'auth-service' };
  }

  private async databaseResponds(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        this.dataSource.query('SELECT 1').then(() => true),
        timeout,
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
