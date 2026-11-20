import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SYSTEM_CODES, type SystemCode } from '../access/access-matrix';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../users/user-rules';

/**
 * Solo valida forma y tamaño. El formato del email no se valida aquí: un email
 * mal formado simplemente no coincide y responde el 401 genérico.
 */
export class LoginDto {
  @ApiProperty({ example: 'admin@techdistribution.com', maxLength: 254 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({ format: 'password', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ enum: SYSTEM_CODES, example: 'INVENTORY' })
  @IsOptional()
  @IsIn(SYSTEM_CODES)
  system?: SystemCode;
}

export class IssuedSystemTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Segundos; igual a exp - iat' })
  expiresIn!: number;
}

export class IssuedTokenDto extends IssuedSystemTokenDto {
  @ApiPropertyOptional({
    type: [IssuedSystemTokenDto],
    description:
      'Todos los access tokens emitidos para los sistemas asignados al usuario.',
  })
  tokens?: IssuedSystemTokenDto[];
}
