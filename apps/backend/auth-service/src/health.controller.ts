import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipEnvelope } from './common/api-response';

interface HealthResponse {
  status: 'ok' | 'ready';
  service: 'auth-service';
}

@ApiTags('health')
@SkipEnvelope()
@Controller('health')
export class HealthController {
  @Get('live')
  @ApiOkResponse({ description: 'El proceso del servicio está activo.' })
  live(): HealthResponse {
    return { status: 'ok', service: 'auth-service' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'La base actual del servicio está lista.' })
  ready(): HealthResponse {
    return { status: 'ready', service: 'auth-service' };
  }
}
