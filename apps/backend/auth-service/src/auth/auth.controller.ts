import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { Request, Response } from 'express';
import {
  clearSessionCookies,
  CSRF_COOKIE,
  readCookie,
  REFRESH_COOKIE,
  setSessionCookies,
} from './session-cookies';

@ApiTags('auth')
@ApiExtraModels(IssuedTokenDto)
@Controller()
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.secureCookies = config.getOrThrow<boolean>('REFRESH_COOKIE_SECURE');
  }

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
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(body);
    setSessionCookies(response, session.credentials, this.secureCookies);
    return session.token;
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ResponseMessage('Sesión renovada exitosamente')
  @ApiOperation({ summary: 'Rota la sesión y emite otro access token' })
  @ApiOkResponse({ type: IssuedTokenDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_REFRESH_TOKEN' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const session = await this.auth.refresh(this.sessionInput(request));
      setSessionCookies(response, session.credentials, this.secureCookies);
      return session.token;
    } catch (error) {
      clearSessionCookies(response, this.secureCookies);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ResponseMessage('Sesión cerrada exitosamente')
  @ApiOperation({ summary: 'Revoca la sesión renovable y limpia sus cookies' })
  @ApiOkResponse({ description: 'Operación idempotente' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      await this.auth.logout(this.sessionInput(request));
      return null;
    } finally {
      clearSessionCookies(response, this.secureCookies);
    }
  }

  private sessionInput(request: Request) {
    const csrfHeader = request.header('x-csrf-token');
    return {
      refreshToken: readCookie(request, REFRESH_COOKIE),
      csrfCookie: readCookie(request, CSRF_COOKIE),
      ...(csrfHeader ? { csrfHeader } : {}),
    };
  }
}
