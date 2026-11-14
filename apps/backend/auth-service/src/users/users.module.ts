import { Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher';
import { UsersService } from './users.service';

/** Dominio de usuarios. Los controladores HTTP se agregan en la fase 5. */
@Module({
  providers: [UsersService, PasswordHasher],
  exports: [UsersService, PasswordHasher],
})
export class UsersModule {}
