import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ROLES,
  SYSTEM_CODES,
  type Role,
  type SystemCode,
} from '../access/access-matrix';
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './user-rules';

/**
 * Los DTO solo validan tipos y forma. Formato de email, longitudes, política
 * de contraseñas y matriz rol/sistema los aplica el dominio (`user-rules.ts`)
 * con los mismos `details[].field`, porque también los usa el bootstrap.
 */

export class AssignmentDto {
  @ApiProperty({ enum: SYSTEM_CODES, example: 'INVENTORY' })
  @IsString()
  system!: string;

  @ApiProperty({
    enum: ROLES,
    example: 'INVENTORY_MANAGER',
    description:
      'INVENTORY admite ADMIN o INVENTORY_MANAGER; PURCHASES admite ADMIN o PURCHASES_AGENT',
  })
  @IsString()
  role!: string;
}

export class CreateUserDto {
  @ApiProperty({
    example: 'gestor@techdistribution.com',
    maxLength: EMAIL_MAX_LENGTH,
    description: 'Se normaliza con trim + lowercase',
  })
  @IsString()
  email!: string;

  @ApiProperty({
    example: 'Gestor de inventario',
    minLength: 1,
    maxLength: DISPLAY_NAME_MAX_LENGTH,
  })
  @IsString()
  displayName!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Se rechazan contraseñas comunes',
  })
  @IsString()
  password!: string;

  @ApiProperty({ type: [AssignmentDto], maxItems: 2 })
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  assignments!: AssignmentDto[];
}

/** Actualización parcial: los campos omitidos se conservan. */
export class UpdateUserDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ example: 'gestor@techdistribution.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'Gestor de inventario' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'false desactiva al usuario (no hay borrado físico)',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: [AssignmentDto],
    maxItems: 2,
    description: 'Reemplaza la lista completa de asignaciones',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  assignments?: AssignmentDto[];
}

export class AssignmentResponseDto {
  @ApiProperty({ enum: SYSTEM_CODES }) system!: SystemCode;
  @ApiProperty({ enum: ROLES }) role!: Role;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'gestor@techdistribution.com' }) email!: string;
  @ApiProperty({ example: 'Gestor de inventario' }) displayName!: string;
  @ApiProperty({ example: true }) active!: boolean;
  @ApiProperty({ example: 1 }) version!: number;
  @ApiProperty({ type: [AssignmentResponseDto] })
  assignments!: AssignmentResponseDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class UserStatsResponseDto {
  @ApiProperty({ example: 12 }) totalUsers!: number;
  @ApiProperty({ example: 10 }) activeUsers!: number;
  @ApiProperty({ example: 2 }) inactiveUsers!: number;
  @ApiProperty({ example: 8 }) inventoryUsers!: number;
  @ApiProperty({ example: 7 }) purchasesUsers!: number;
  @ApiProperty({ example: 2 }) adminUsers!: number;
}
