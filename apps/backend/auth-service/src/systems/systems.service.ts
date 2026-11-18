import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SYSTEM_CODES, type SystemCode } from '../access/access-matrix';
import { AuditAction, recordAudit } from '../audit/audit-log';
import { TokenService } from '../auth/token.service';
import { AuthDomainError, ErrorCode, type ErrorDetail } from '../common/errors';
import { currentRequestId } from '../common/request-context';
import { SystemEntity } from '../database/entities/system.entity';
import { throwIfInvalid } from '../users/user-rules';

export interface SystemView {
  code: SystemCode;
  accessTokenTtlSeconds: number;
  /** Límite vigente (`JWT_MAX_TTL_SECONDS`); el TTL nunca lo supera. */
  maxAccessTokenTtlSeconds: number;
  version: number;
  updatedAt: Date;
}

export interface UpdateSystemInput {
  expectedVersion: number;
  accessTokenTtlSeconds: number;
}

const notFound = () =>
  new AuthDomainError(
    404,
    ErrorCode.RESOURCE_NOT_FOUND,
    'El sistema no existe',
  );

/**
 * Catálogo de sistemas. Cambiar el TTL solo afecta a emisiones futuras; los
 * tokens ya emitidos conservan su `exp`. No publica eventos: los sistemas no
 * forman parte del snapshot de usuario.
 */
@Injectable()
export class SystemsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
  ) {}

  async list(): Promise<SystemView[]> {
    const systems = await this.dataSource.manager.find(SystemEntity, {
      order: { code: 'ASC' },
    });
    return systems.map((system) => this.toView(system));
  }

  async updateTtl(
    code: string,
    input: UpdateSystemInput,
    actorUserId: string,
  ): Promise<SystemView> {
    const max = this.tokens.maxTtlSeconds;
    const details: ErrorDetail[] = [];
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    )
      details.push({
        field: 'expectedVersion',
        code: 'INVALID_VERSION',
        message: 'Debe ser un entero mayor o igual a 1',
      });
    const ttl = input.accessTokenTtlSeconds;
    if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > max)
      details.push({
        field: 'accessTokenTtlSeconds',
        code: 'OUT_OF_RANGE',
        message: `Debe ser un entero entre 1 y ${max} (JWT_MAX_TTL_SECONDS)`,
      });
    throwIfInvalid(details);
    if (!(SYSTEM_CODES as readonly string[]).includes(code)) throw notFound();

    const correlationId = currentRequestId() ?? randomUUID();
    return this.dataSource.transaction(async (manager) => {
      const system = await manager.findOne(SystemEntity, {
        where: { code: code as SystemCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!system) throw notFound();
      if (system.version !== input.expectedVersion)
        throw new AuthDomainError(
          409,
          ErrorCode.VERSION_CONFLICT,
          'El recurso fue modificado por otra operación',
        );
      if (system.accessTokenTtlSeconds === ttl) return this.toView(system);

      await manager.update(
        SystemEntity,
        { code: system.code },
        {
          accessTokenTtlSeconds: ttl,
          version: () => 'version + 1',
          updatedAt: () => 'now()',
        },
      );
      const updated = await manager.findOneByOrFail(SystemEntity, {
        code: system.code,
      });
      await recordAudit(manager, {
        actorUserId,
        action: AuditAction.SYSTEM_UPDATED,
        targetType: 'SYSTEM',
        targetKey: updated.code,
        targetVersion: updated.version,
        requestId: correlationId,
        details: {
          previousAccessTokenTtlSeconds: system.accessTokenTtlSeconds,
          accessTokenTtlSeconds: ttl,
        },
      });
      return this.toView(updated);
    });
  }

  private toView(system: SystemEntity): SystemView {
    return {
      code: system.code,
      accessTokenTtlSeconds: system.accessTokenTtlSeconds,
      maxAccessTokenTtlSeconds: this.tokens.maxTtlSeconds,
      version: system.version,
      updatedAt: system.updatedAt,
    };
  }
}
