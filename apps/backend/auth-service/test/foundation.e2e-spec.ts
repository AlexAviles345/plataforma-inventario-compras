import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsInt, Min, ValidateNested } from 'class-validator';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createAuthApplication } from '../src/bootstrap';
import {
  PaginatedResult,
  PaginationQueryDto,
  ResponseMessage,
} from '../src/common/api-response';
import { AuthDomainError } from '../src/common/errors';
import { currentRequestId } from '../src/common/request-context';

class ProbeLineDto {
  @IsInt()
  @Min(1)
  quantity!: number;
}

class ProbeDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbeLineDto)
  lines!: ProbeLineDto[];
}

/** Controlador solo para pruebas: ejercita la cadena HTTP transversal. */
@Controller('probe')
class ProbeController {
  @Get('item')
  @ResponseMessage('Elemento obtenido exitosamente')
  item() {
    return { id: 1, requestId: currentRequestId() };
  }

  @Get('empty')
  empty(): void {}

  @Post('items')
  @HttpCode(201)
  @ResponseMessage('Recurso creado exitosamente')
  create(@Body() body: ProbeDto) {
    return { email: body.email, lines: body.lines.length };
  }

  @Get('list')
  list(@Query() query: PaginationQueryDto) {
    return new PaginatedResult(['a', 'b'], query.page, query.limit, 37);
  }

  @Get('conflict')
  conflict(): never {
    throw new AuthDomainError(409, 'VERSION_CONFLICT', 'Conflicto', [], {
      'Retry-After': '2',
    });
  }

  @Get('crash')
  crash(): never {
    throw new Error('relation "users" does not exist');
  }
}

@Module({ imports: [AppModule], controllers: [ProbeController] })
class ProbeModule {}

interface ResponseBody {
  data: { requestId?: string };
  details?: { field?: string; code: string; message: string }[];
  servers?: { url: string }[];
}

const body = (response: request.Response) => response.body as ResponseBody;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Auth HTTP foundation', () => {
  let app: NestExpressApplication;
  let server: Server;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DOCS_ENABLED: 'true',
      PORT: '3001',
    });
    app = await createAuthApplication(ProbeModule);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (server) server.closeAllConnections();
    if (app) await app.close();
  });

  describe('success envelope', () => {
    it('wraps data with the declared message and matching status', async () => {
      const response = await request(server)
        .get('/api/auth/probe/item')
        .expect(200);
      expect(response.body).toEqual({
        error: false,
        statusCode: 200,
        message: 'Elemento obtenido exitosamente',
        data: { id: 1, requestId: response.headers['x-request-id'] },
      });
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('always includes data, using null when there is nothing to return', async () => {
      const response = await request(server)
        .get('/api/auth/probe/empty')
        .expect(200);
      expect(response.body).toEqual({
        error: false,
        statusCode: 200,
        message: 'Operación completada exitosamente',
        data: null,
      });
    });

    it('reports 201 in both the status line and the body', async () => {
      const response = await request(server)
        .post('/api/auth/probe/items')
        .send({ email: 'a@b.com', lines: [{ quantity: 2 }] })
        .expect(201);
      expect(response.body).toMatchObject({
        error: false,
        statusCode: 201,
        data: { email: 'a@b.com', lines: 1 },
      });
    });

    it('places paginated items in data and the page in meta', async () => {
      const response = await request(server)
        .get('/api/auth/probe/list?page=2&limit=20')
        .expect(200);
      expect(response.body).toMatchObject({
        data: ['a', 'b'],
        meta: { page: 2, limit: 20, total: 37, totalPages: 2 },
      });
    });

    it('does not wrap health endpoints', async () => {
      await request(server)
        .get('/health/live')
        .expect(200, { status: 'ok', service: 'auth-service' });
    });
  });

  describe('error envelope', () => {
    const errorShape = (statusCode: number, code: string) => ({
      error: true,
      statusCode,
      code,
      message: expect.any(String) as unknown,
      source: 'auth',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) as unknown,
    });

    it('returns field details for invalid bodies', async () => {
      const response = await request(server)
        .post('/api/auth/probe/items')
        .send({ email: 'malo', lines: [{ quantity: 0 }], extra: true })
        .expect(400);
      expect(response.body).toMatchObject(errorShape(400, 'VALIDATION_ERROR'));
      expect(body(response).details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email', code: 'IS_EMAIL' }),
          expect.objectContaining({ field: 'lines[0].quantity', code: 'MIN' }),
          expect.objectContaining({ field: 'extra', code: 'UNKNOWN_FIELD' }),
        ]),
      );
    });

    it('rejects malformed JSON with the standard envelope', async () => {
      const response = await request(server)
        .post('/api/auth/probe/items')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);
      expect(response.body).toEqual(errorShape(400, 'VALIDATION_ERROR'));
      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it('rejects invalid pagination parameters', async () => {
      const response = await request(server)
        .get('/api/auth/probe/list?page=0&limit=101')
        .expect(400);
      expect(body(response).details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'page' }),
          expect.objectContaining({ field: 'limit' }),
        ]),
      );
    });

    it('wraps unknown routes as RESOURCE_NOT_FOUND', async () => {
      const response = await request(server)
        .get('/api/auth/no-existe')
        .expect(404);
      expect(response.body).toEqual(errorShape(404, 'RESOURCE_NOT_FOUND'));
    });

    it('keeps domain error codes and headers', async () => {
      const response = await request(server)
        .get('/api/auth/probe/conflict')
        .expect(409);
      expect(response.body).toEqual({
        ...errorShape(409, 'VERSION_CONFLICT'),
        message: 'Conflicto',
      });
      expect(response.headers['retry-after']).toBe('2');
    });

    it('hides internal error details', async () => {
      const response = await request(server)
        .get('/api/auth/probe/crash')
        .expect(500);
      expect(response.body).toEqual(errorShape(500, 'INTERNAL_ERROR'));
      expect(JSON.stringify(response.body)).not.toContain('relation');
    });
  });

  describe('X-Request-Id', () => {
    it('propagates a valid incoming request id', async () => {
      const id = '4a037dac-a9f1-4f91-94d7-b926fb395be6';
      const response = await request(server)
        .get('/api/auth/probe/item')
        .set('X-Request-Id', id)
        .expect(200);
      expect(response.headers['x-request-id']).toBe(id);
      expect(body(response).data.requestId).toBe(id);
    });

    it('replaces an invalid request id', async () => {
      const response = await request(server)
        .get('/api/auth/probe/item')
        .set('X-Request-Id', 'inyectado\\n')
        .expect(200);
      expect(response.headers['x-request-id']).toMatch(UUID);
      expect(response.headers['x-request-id']).not.toContain('inyectado');
    });

    it('is present on error responses', async () => {
      const response = await request(server)
        .get('/api/auth/no-existe')
        .expect(404);
      expect(response.headers['x-request-id']).toMatch(UUID);
    });
  });

  it('declares the root server in the OpenAPI document', async () => {
    const response = await request(server)
      .get('/api/auth/openapi.json')
      .expect(200);
    expect(body(response).servers).toEqual([{ url: '/' }]);
  });
});
