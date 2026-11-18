import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { buildPaginationMeta } from './api-response';
import { AuthDomainError } from './errors';
import { mapException } from './http-exception.filter';
import { resolveRequestId } from './request-context';
import { flattenValidationErrors } from './validation';

class AssignmentDto {
  @IsIn(['INVENTORY', 'PURCHASES'])
  system!: string;
}

class UserDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  assignments!: AssignmentDto[];
}

describe('flattenValidationErrors', () => {
  it('uses client JSON paths, including array indexes', () => {
    const dto = plainToInstance(UserDto, {
      email: 'no-es-email',
      assignments: [{ system: 'INVENTORY' }, { system: 'OTRO' }],
    });
    const details = flattenValidationErrors(validateSync(dto));
    expect(details).toMatchObject([
      { field: 'email', code: 'IS_EMAIL' },
      { field: 'assignments[1].system', code: 'IS_IN' },
    ]);
    expect(details.every((detail) => detail.message.length > 0)).toBe(true);
  });

  it('never exposes the rejected value', () => {
    const dto = plainToInstance(UserDto, {
      email: 'secreto-no-valido',
      assignments: [],
    });
    const serialized = JSON.stringify(
      flattenValidationErrors(validateSync(dto)),
    );
    expect(serialized).not.toContain('secreto-no-valido');
  });
});

describe('mapException', () => {
  it('keeps domain errors as declared', () => {
    expect(
      mapException(
        new AuthDomainError(409, 'VERSION_CONFLICT', 'Conflicto', [], {
          'Retry-After': '2',
        }),
      ),
    ).toEqual({
      statusCode: 409,
      code: 'VERSION_CONFLICT',
      message: 'Conflicto',
      details: [],
      headers: { 'Retry-After': '2' },
    });
  });

  it('maps framework exceptions to stable codes without their messages', () => {
    expect(mapException(new NotFoundException('Cannot GET /x'))).toEqual({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'El recurso solicitado no existe',
    });
    expect(mapException(new UnauthorizedException()).code).toBe(
      'AUTHENTICATION_REQUIRED',
    );
    expect(mapException(new BadRequestException('interno')).message).toBe(
      'La solicitud contiene datos inválidos',
    );
    expect(mapException(new ConflictException()).code).toBe('CONFLICT');
  });

  it('maps body parser failures', () => {
    expect(
      mapException({ type: 'entity.parse.failed', status: 400 }).message,
    ).toBe('El cuerpo JSON de la solicitud es inválido');
    expect(mapException({ type: 'entity.too.large', status: 413 }).code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });

  it('hides unexpected errors behind INTERNAL_ERROR', () => {
    const mapped = mapException(new Error('password_hash column missing'));
    expect(mapped).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(mapped.message).not.toContain('password_hash');
  });
});

describe('buildPaginationMeta', () => {
  it.each([
    [1, 20, 37, 2],
    [1, 20, 0, 0],
    [3, 10, 30, 3],
  ])('page %i limit %i total %i → %i pages', (page, limit, total, pages) => {
    expect(buildPaginationMeta(page, limit, total)).toEqual({
      page,
      limit,
      total,
      totalPages: pages,
    });
  });
});

describe('resolveRequestId', () => {
  it('keeps a canonical UUID, normalized to lowercase', () => {
    expect(resolveRequestId(' 4A037DAC-A9F1-4F91-94D7-B926FB395BE6 ')).toBe(
      '4a037dac-a9f1-4f91-94d7-b926fb395be6',
    );
  });

  it.each([undefined, '', 'abc', ['x'], 'a'.repeat(36)])(
    'generates a new UUID for %p',
    (raw) => {
      expect(resolveRequestId(raw)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );
});
