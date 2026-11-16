import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/**
 * Login, emisión y validación de tokens. `JwtModule` se registra sin opciones:
 * `TokenService` pasa secreto, algoritmo, emisor y audiencia en cada llamada.
 */
@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, AdminGuard],
  exports: [TokenService, AdminGuard],
})
export class AuthModule {}
