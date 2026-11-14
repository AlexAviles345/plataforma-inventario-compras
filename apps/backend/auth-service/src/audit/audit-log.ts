import type { EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  AuthAuditLogEntity,
  type AuditTargetType,
} from '../database/entities/auth-audit-log.entity';

/** Acciones estables registradas en `auth_audit_log`. */
export const AuditAction = {
  BOOTSTRAP_ADMIN: 'BOOTSTRAP_ADMIN',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetKey: string;
  targetVersion: number | null;
  requestId: string;
  /** Metadatos saneados: nombres de campos y valores públicos, nunca secretos. */
  details: Record<string, unknown>;
}

/** Inserta en la transacción del cambio auditado. La tabla es append-only. */
export async function recordAudit(
  manager: EntityManager,
  entry: AuditEntry,
): Promise<void> {
  await manager.insert(AuthAuditLogEntity, {
    ...entry,
    details: entry.details as QueryDeepPartialEntity<Record<string, unknown>>,
  });
}
