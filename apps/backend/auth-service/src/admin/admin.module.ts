import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from '../users/users.controller';
import { UsersModule } from '../users/users.module';

/**
 * Rutas administrativas (solo ADMIN). Viven aparte para que `AuthModule`
 * (que usa `UsersModule`) y los controladores protegidos por `AdminGuard`
 * no formen una dependencia circular.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [UsersController],
})
export class AdminModule {}
