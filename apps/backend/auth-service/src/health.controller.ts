import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

interface HealthResponse {
  status: 'ok' | 'ready';
  service: 'auth-service';
}

@ApiTags('health')
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
