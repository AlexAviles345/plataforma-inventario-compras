import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
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

  @ApiProperty({ enum: SYSTEM_CODES, example: 'INVENTORY' })
  @IsIn(SYSTEM_CODES)
  system!: SystemCode;
}

export class IssuedTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Segundos; igual a exp - iat' })
  expiresIn!: number;
}
