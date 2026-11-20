import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AdminGuard,
  CurrentPrincipal,
  type Principal,
} from '../auth/admin.guard';
import {
  PaginatedResult,
  PaginationQueryDto,
  ResponseMessage,
} from '../common/api-response';
import {
  ADMIN_AUTH_ERRORS,
  ApiErrors,
  ApiSuccess,
  type ErrorExample,
} from '../common/openapi';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UserStatsResponseDto,
} from './users.dto';
import { UsersService } from './users.service';

const VALIDATION: ErrorExample = [
  400,
  'VALIDATION_ERROR',
  'La solicitud contiene datos inválidos',
  [
    {
      field: 'assignments[0].role',
      code: 'ROLE_NOT_ALLOWED_FOR_SYSTEM',
      message:
        'Para INVENTORY el rol debe ser uno de: ADMIN, INVENTORY_MANAGER',
    },
  ],
];
const NOT_FOUND: ErrorExample = [
  404,
  'RESOURCE_NOT_FOUND',
  'El usuario no existe',
];
const EMAIL_TAKEN: ErrorExample = [
  409,
  'EMAIL_ALREADY_EXISTS',
  'Ya existe un usuario con ese email',
];

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(201)
  @ResponseMessage('Usuario creado exitosamente')
  @ApiOperation({
    summary: 'Crea un usuario con sus asignaciones',
    description: 'Solo ADMIN. Publica UserCreated mediante el outbox.',
  })
  @ApiSuccess({
    status: 201,
    message: 'Usuario creado exitosamente',
    model: UserResponseDto,
  })
  @ApiErrors(VALIDATION, ...ADMIN_AUTH_ERRORS, EMAIL_TAKEN)
  async create(
    @Body() body: CreateUserDto,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.users.createUser(body, {
      actorUserId: principal.userId,
    });
    response.location(`/api/auth/users/${user.id}`);
    return user;
  }

  @Get()
  @ResponseMessage('Usuarios obtenidos exitosamente')
  @ApiOperation({
    summary: 'Lista usuarios con sus asignaciones',
    description:
      'Solo ADMIN. Paginado y ordenado por email; nunca incluye el hash.',
  })
  @ApiSuccess({
    status: 200,
    message: 'Usuarios obtenidos exitosamente',
    model: UserResponseDto,
    paginated: true,
  })
  @ApiErrors(
    [400, 'VALIDATION_ERROR', 'La solicitud contiene datos inválidos'],
    ...ADMIN_AUTH_ERRORS,
  )
  async list(@Query() query: PaginationQueryDto) {
    const { items, total } = await this.users.listUsers(
      query.page,
      query.limit,
    );
    return new PaginatedResult(items, query.page, query.limit, total);
  }

  @Get('stats')
  @ResponseMessage('Estadísticas de usuarios obtenidas exitosamente')
  @ApiOperation({
    summary: 'Consulta estadísticas generales de usuarios y asignaciones',
    description: 'Solo ADMIN.',
  })
  @ApiSuccess({
    status: 200,
    message: 'Estadísticas de usuarios obtenidas exitosamente',
    model: UserStatsResponseDto,
  })
  @ApiErrors(...ADMIN_AUTH_ERRORS)
  stats() {
    return this.users.getStats();
  }

  @Get(':id')
  @ResponseMessage('Usuario obtenido exitosamente')
  @ApiOperation({ summary: 'Consulta un usuario', description: 'Solo ADMIN.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiSuccess({
    status: 200,
    message: 'Usuario obtenido exitosamente',
    model: UserResponseDto,
  })
  @ApiErrors(...ADMIN_AUTH_ERRORS, NOT_FOUND)
  findOne(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Put(':id')
  @ResponseMessage('Usuario actualizado exitosamente')
  @ApiOperation({
    summary: 'Actualiza un usuario con control optimista',
    description:
      'Solo ADMIN. Parcial: conserva los campos omitidos; assignments reemplaza la lista. active:false desactiva. Publica UserUpdated si cambia el snapshot público.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiSuccess({
    status: 200,
    message: 'Usuario actualizado exitosamente',
    model: UserResponseDto,
  })
  @ApiErrors(
    VALIDATION,
    ...ADMIN_AUTH_ERRORS,
    NOT_FOUND,
    [409, 'VERSION_CONFLICT', 'El recurso fue modificado por otra operación'],
    EMAIL_TAKEN,
    [
      409,
      'LAST_ACTIVE_ADMIN',
      'No se puede desactivar ni retirar el rol al último administrador activo',
    ],
  )
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.users.updateUser(id, body, { actorUserId: principal.userId });
  }
}
