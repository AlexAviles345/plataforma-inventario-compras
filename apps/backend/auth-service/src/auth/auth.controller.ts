import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';
import { ResponseMessage } from '../common/api-response';
import { AuthService } from './auth.service';
import { IssuedTokenDto, LoginDto } from './login.dto';

@ApiTags('auth')
@ApiExtraModels(IssuedTokenDto)
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ResponseMessage('Inicio de sesión exitoso')
  @ApiOperation({
    summary: 'Emite un access token para un sistema',
    description:
      'Público. Usuario desconocido, inactivo, contraseña incorrecta o sin asignación al sistema responden el mismo 401.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'boolean', example: false },
        statusCode: { type: 'integer', example: 200 },
        message: { type: 'string', example: 'Inicio de sesión exitoso' },
        data: { $ref: getSchemaPath(IssuedTokenDto) },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }
}
