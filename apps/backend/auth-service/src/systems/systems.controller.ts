import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { SYSTEM_CODES, type SystemCode } from '../access/access-matrix';
import {
  AdminGuard,
  CurrentPrincipal,
  type Principal,
} from '../auth/admin.guard';
import { ResponseMessage } from '../common/api-response';
import { ADMIN_AUTH_ERRORS, ApiErrors, ApiSuccess } from '../common/openapi';
import { SystemsService } from './systems.service';

export class UpdateSystemDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({
    example: 600,
    minimum: 1,
    description: 'Segundos; como máximo JWT_MAX_TTL_SECONDS (900 por defecto)',
  })
  @IsInt()
  accessTokenTtlSeconds!: number;
}

export class SystemResponseDto {
  @ApiProperty({ enum: SYSTEM_CODES }) code!: SystemCode;
  @ApiProperty({ example: 900 }) accessTokenTtlSeconds!: number;
  @ApiProperty({
    example: 900,
    description:
      'JWT_MAX_TTL_SECONDS vigente; límite para accessTokenTtlSeconds',
  })
  maxAccessTokenTtlSeconds!: number;
  @ApiProperty({ example: 1 }) version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

@ApiTags('systems')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('systems')
export class SystemsController {
  constructor(private readonly systems: SystemsService) {}

  @Get()
  @ResponseMessage('Sistemas obtenidos exitosamente')
  @ApiOperation({
    summary: 'Lista los sistemas y su TTL',
    description: 'Solo ADMIN.',
  })
  @ApiSuccess({
    status: 200,
    message: 'Sistemas obtenidos exitosamente',
    model: SystemResponseDto,
    isArray: true,
  })
  @ApiErrors(...ADMIN_AUTH_ERRORS)
  list() {
    return this.systems.list();
  }

  @Put(':code')
  @ResponseMessage('Sistema actualizado exitosamente')
  @ApiOperation({
    summary: 'Cambia el TTL de los futuros access tokens del sistema',
    description:
      'Solo ADMIN, con expectedVersion. No afecta a tokens ya emitidos.',
  })
  @ApiParam({ name: 'code', enum: SYSTEM_CODES })
  @ApiSuccess({
    status: 200,
    message: 'Sistema actualizado exitosamente',
    model: SystemResponseDto,
  })
  @ApiErrors(
    [
      400,
      'VALIDATION_ERROR',
      'La solicitud contiene datos inválidos',
      [
        {
          field: 'accessTokenTtlSeconds',
          code: 'OUT_OF_RANGE',
          message: 'Debe ser un entero entre 1 y 900 (JWT_MAX_TTL_SECONDS)',
        },
      ],
    ],
    ...ADMIN_AUTH_ERRORS,
    [404, 'RESOURCE_NOT_FOUND', 'El sistema no existe'],
    [409, 'VERSION_CONFLICT', 'El recurso fue modificado por otra operación'],
  )
  update(
    @Param('code') code: string,
    @Body() body: UpdateSystemDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.systems.updateTtl(code, body, principal.userId);
  }
}
