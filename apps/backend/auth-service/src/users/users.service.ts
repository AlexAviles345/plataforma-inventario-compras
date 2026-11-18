import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import type { SystemCode } from '../access/access-matrix';
import { AuditAction, recordAudit } from '../audit/audit-log';
import { AuthDomainError, ErrorCode, type ErrorDetail } from '../common/errors';
import { currentRequestId } from '../common/request-context';
import { UserSystemEntity } from '../database/entities/user-system.entity';
import { UserEntity } from '../database/entities/user.entity';
import type { UserEventType } from '../database/entities/outbox-event.entity';
import { enqueueUserEvent } from '../events/outbox';
import { buildUserEvent, type PublicUserSnapshot } from '../events/user-event';
import { PasswordHasher } from './password-hasher';
import {
  displayNameViolations,
  emailViolations,
  hasAdminRole,
  normalizeDisplayName,
  normalizeEmail,
  passwordViolations,
  sameAssignments,
  sortAssignments,
  throwIfInvalid,
  validateAssignments,
  type Assignment,
  type AssignmentInput,
} from './user-rules';

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  assignments: AssignmentInput[];
}

/** Campos omitidos se conservan; `assignments` reemplaza la lista completa. */
export interface UpdateUserInput {
  expectedVersion: number;
  email?: string;
  displayName?: string;
  password?: string;
  active?: boolean;
  assignments?: AssignmentInput[];
}

export interface BootstrapAdminInput {
  email: string;
  displayName: string;
  password: string;
}

export type BootstrapAdminResult =
  { created: true; user: UserView } | { created: false };

/** El primer administrador gestiona ambos sistemas. */
const BOOTSTRAP_ASSIGNMENTS: AssignmentInput[] = [
  { system: 'INVENTORY', role: 'ADMIN' },
  { system: 'PURCHASES', role: 'ADMIN' },
];

/** Usuario ya validado y normalizado, listo para insertar. */
interface NewUser {
  email: string;
  displayName: string;
  passwordHash: string;
  assignments: Assignment[];
}

export interface ActorContext {
  /** Nulo solo para el bootstrap inicial. */
  actorUserId: string | null;
  auditAction?: AuditAction;
}

/** Vista de lectura de un usuario: nunca contiene el hash. */
export interface UserView {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  version: number;
  assignments: Assignment[];
  createdAt: Date;
  updatedAt: Date;
}

type ChangedField =
  'email' | 'displayName' | 'password' | 'active' | 'assignments';

/** Campos que forman parte del snapshot público y por lo tanto publican evento. */
const PUBLIC_FIELDS: readonly ChangedField[] = [
  'email',
  'displayName',
  'active',
  'assignments',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serializa toda operación que pueda dejar de tener un ADMIN activo. */
const ACTIVE_ADMINS_LOCK = "hashtextextended('auth.active-admins', 0)";

const notFound = () =>
  new AuthDomainError(
    404,
    ErrorCode.RESOURCE_NOT_FOUND,
    'El usuario no existe',
  );

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return driverError.code === '23505' && driverError.constraint === constraint;
}

function translateWriteError(error: unknown): never {
  if (isUniqueViolation(error, 'uq_users_email'))
    throw new AuthDomainError(
      409,
      ErrorCode.EMAIL_ALREADY_EXISTS,
      'Ya existe un usuario con ese email',
      [
        {
          field: 'email',
          code: ErrorCode.EMAIL_ALREADY_EXISTS,
          message: 'Ya existe un usuario con ese email',
        },
      ],
    );
  throw error;
}

function toView(user: UserEntity, assignments: Assignment[]): UserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    active: user.active,
    version: user.version,
    assignments: sortAssignments(assignments),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toSnapshot(view: UserView): PublicUserSnapshot {
  return {
    userId: view.id,
    email: view.email,
    displayName: view.displayName,
    active: view.active,
    assignments: view.assignments,
  };
}

const toAssignments = (rows: UserSystemEntity[]): Assignment[] =>
  rows.map((row) => ({ system: row.systemCode, role: row.role }));

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
  ) {}

  /** Página ordenada por email; las asignaciones se cargan en una consulta. */
  async listUsers(
    page: number,
    limit: number,
  ): Promise<{ items: UserView[]; total: number }> {
    const manager = this.dataSource.manager;
    const [users, total] = await manager.findAndCount(UserEntity, {
      order: { email: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const rows =
      users.length === 0
        ? []
        : await manager.find(UserSystemEntity, {
            where: { userId: In(users.map((user) => user.id)) },
          });
    const byUser = new Map<string, Assignment[]>();
    for (const row of rows)
      byUser.set(row.userId, [
        ...(byUser.get(row.userId) ?? []),
        { system: row.systemCode, role: row.role },
      ]);
    return {
      items: users.map((user) => toView(user, byUser.get(user.id) ?? [])),
      total,
    };
  }

  async findById(id: string): Promise<UserView> {
    if (!UUID_PATTERN.test(id)) throw notFound();
    const view = await this.loadView(this.dataSource.manager, id);
    if (!view) throw notFound();
    return view;
  }

  /**
   * Crea usuario + asignaciones (`version` 1) junto con su auditoría y el
   * evento `UserCreated` en una sola transacción.
   */
  async createUser(
    input: CreateUserInput,
    actor: ActorContext,
  ): Promise<UserView> {
    const user = await this.prepareNewUser(input);
    const correlationId = currentRequestId() ?? randomUUID();
    try {
      return await this.dataSource.transaction((manager) =>
        this.insertNewUser(manager, user, {
          action: actor.auditAction ?? AuditAction.USER_CREATED,
          actorUserId: actor.actorUserId,
          correlationId,
          details: { assignments: user.assignments },
        }),
      );
    } catch (error) {
      translateWriteError(error);
    }
  }

  /**
   * Crea el primer ADMIN (ADMIN en ambos sistemas) solo si no existe ningún
   * ADMIN activo. Idempotente: nunca modifica, recrea ni reactiva usuarios
   * existentes. Usa el mismo candado que la protección del último ADMIN, así
   * que dos bootstraps simultáneos no crean dos administradores.
   */
  async bootstrapAdmin(
    input: BootstrapAdminInput,
  ): Promise<BootstrapAdminResult> {
    const user = await this.prepareNewUser({
      ...input,
      assignments: BOOTSTRAP_ASSIGNMENTS,
    });
    const correlationId = currentRequestId() ?? randomUUID();
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockActiveAdmins(manager);
        if (await this.activeAdminExists(manager))
          return { created: false } as const;
        const view = await this.insertNewUser(manager, user, {
          action: AuditAction.BOOTSTRAP_ADMIN,
          actorUserId: null,
          correlationId,
          details: { source: 'cli', assignments: user.assignments },
        });
        return { created: true, user: view } as const;
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  /** Lectura sin candado, solo orientativa (la decisión se toma con candado). */
  hasActiveAdmin(): Promise<boolean> {
    return this.activeAdminExists(this.dataSource.manager);
  }

  /** Valida y calcula el hash antes de abrir la transacción (Argon2 es costoso). */
  private async prepareNewUser(input: CreateUserInput): Promise<NewUser> {
    const email = normalizeEmail(input.email);
    const displayName = normalizeDisplayName(input.displayName);
    const { assignments, details } = validateAssignments(input.assignments);
    throwIfInvalid([
      ...emailViolations(email),
      ...displayNameViolations(displayName),
      ...passwordViolations(input.password),
      ...details,
    ]);
    const passwordHash = await this.hasher.hash(input.password);
    return { email, displayName, passwordHash, assignments };
  }

  private async insertNewUser(
    manager: EntityManager,
    user: NewUser,
    audit: {
      action: AuditAction;
      actorUserId: string | null;
      correlationId: string;
      details: Record<string, unknown>;
    },
  ): Promise<UserView> {
    const { email, displayName, passwordHash, assignments } = user;
    const { id } = await manager
      .insert(UserEntity, { email, displayName, passwordHash })
      .then((result) => result.identifiers[0] as { id: string });
    if (assignments.length > 0)
      await manager.insert(
        UserSystemEntity,
        assignments.map(({ system, role }) => ({
          userId: id,
          systemCode: system,
          role,
        })),
      );

    const view = await this.loadView(manager, id);
    if (!view) throw new Error('El usuario recién creado no es visible');
    await this.recordChange(manager, view, {
      eventType: 'UserCreated',
      ...audit,
    });
    return view;
  }

  /**
   * Aplica los campos presentes con control optimista (`expectedVersion`). Un
   * cambio incrementa `version` una sola vez; si afecta al snapshot público
   * también publica `UserUpdated`. Sin cambios reales no escribe nada.
   */
  async updateUser(
    id: string,
    input: UpdateUserInput,
    actor: ActorContext,
  ): Promise<UserView> {
    const violations: ErrorDetail[] = [];
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    )
      violations.push({
        field: 'expectedVersion',
        code: 'INVALID_VERSION',
        message: 'Debe ser un entero mayor o igual a 1',
      });
    const email =
      input.email === undefined ? undefined : normalizeEmail(input.email);
    if (email !== undefined) violations.push(...emailViolations(email));
    const displayName =
      input.displayName === undefined
        ? undefined
        : normalizeDisplayName(input.displayName);
    if (displayName !== undefined)
      violations.push(...displayNameViolations(displayName));
    if (input.password !== undefined)
      violations.push(...passwordViolations(input.password));
    let assignments: Assignment[] | undefined;
    if (input.assignments !== undefined) {
      const result = validateAssignments(input.assignments);
      assignments = result.assignments;
      violations.push(...result.details);
    }
    throwIfInvalid(violations);
    if (!UUID_PATTERN.test(id)) throw notFound();

    const passwordHash =
      input.password === undefined
        ? undefined
        : await this.hasher.hash(input.password);
    const correlationId = currentRequestId() ?? randomUUID();

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Bloqueo de fila: las escrituras concurrentes al mismo usuario se
        // serializan y la comparación de versión es fiable.
        const user = await manager.findOne(UserEntity, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw notFound();
        if (user.version !== input.expectedVersion)
          throw new AuthDomainError(
            409,
            ErrorCode.VERSION_CONFLICT,
            'El recurso fue modificado por otra operación',
          );

        const current = toAssignments(
          await manager.find(UserSystemEntity, { where: { userId: id } }),
        );
        const next = {
          email: email ?? user.email,
          displayName: displayName ?? user.displayName,
          active: input.active ?? user.active,
          assignments: assignments ?? current,
        };
        const changes: ChangedField[] = [];
        if (next.email !== user.email) changes.push('email');
        if (next.displayName !== user.displayName) changes.push('displayName');
        if (passwordHash !== undefined) changes.push('password');
        if (next.active !== user.active) changes.push('active');
        if (!sameAssignments(next.assignments, current))
          changes.push('assignments');
        if (changes.length === 0) return toView(user, current);

        const wasActiveAdmin = user.active && hasAdminRole(current);
        const staysActiveAdmin = next.active && hasAdminRole(next.assignments);
        if (wasActiveAdmin && !staysActiveAdmin)
          await this.ensureAnotherActiveAdmin(manager, id);

        await manager.update(
          UserEntity,
          { id },
          {
            email: next.email,
            displayName: next.displayName,
            active: next.active,
            ...(passwordHash === undefined ? {} : { passwordHash }),
            version: () => 'version + 1',
            updatedAt: () => 'now()',
          },
        );
        if (changes.includes('assignments'))
          await this.replaceAssignments(manager, id, current, next.assignments);

        if (changes.includes('password') || changes.includes('active')) {
          await this.revokeRefreshSessions(manager, id);
        } else if (changes.includes('assignments')) {
          const currentBySystem = new Map(
            current.map((assignment) => [assignment.system, assignment.role]),
          );
          const nextBySystem = new Map(
            next.assignments.map((assignment) => [
              assignment.system,
              assignment.role,
            ]),
          );
          const affectedSystems = [
            ...new Set([
              ...current.map((assignment) => assignment.system),
              ...next.assignments.map((assignment) => assignment.system),
            ]),
          ].filter(
            (system) =>
              currentBySystem.get(system) !== nextBySystem.get(system),
          );
          await this.revokeRefreshSessions(manager, id, affectedSystems);
        }

        const view = await this.loadView(manager, id);
        if (!view) throw notFound();
        const publicChange = changes.some((field) =>
          PUBLIC_FIELDS.includes(field),
        );
        await this.recordChange(manager, view, {
          eventType: publicChange ? 'UserUpdated' : null,
          action: actor.auditAction ?? AuditAction.USER_UPDATED,
          actorUserId: actor.actorUserId,
          correlationId,
          details: {
            changes,
            ...(changes.includes('active') ? { active: next.active } : {}),
            ...(changes.includes('assignments')
              ? { assignments: next.assignments }
              : {}),
          },
        });
        return view;
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  /**
   * Toma un candado de transacción global antes de contar: dos operaciones que
   * retiran administradores a la vez se ejecutan en serie y la segunda ve el
   * resultado confirmado de la primera.
   */
  private async ensureAnotherActiveAdmin(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await this.lockActiveAdmins(manager);
    if (!(await this.activeAdminExists(manager, userId)))
      throw new AuthDomainError(
        409,
        ErrorCode.LAST_ACTIVE_ADMIN,
        'No se puede desactivar ni retirar el rol al último administrador activo',
      );
  }

  /** Se libera solo al terminar la transacción. */
  private async lockActiveAdmins(manager: EntityManager): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock(${ACTIVE_ADMINS_LOCK})`);
  }

  private async activeAdminExists(
    manager: EntityManager,
    excludeUserId?: string,
  ): Promise<boolean> {
    const [{ found }] = await manager.query<{ found: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM users u
         JOIN user_systems us ON us.user_id = u.id
         WHERE u.active AND us.role = 'ADMIN'
           AND ($1::uuid IS NULL OR u.id <> $1::uuid)
       ) AS found`,
      [excludeUserId ?? null],
    );
    return found;
  }

  private async replaceAssignments(
    manager: EntityManager,
    userId: string,
    current: Assignment[],
    next: Assignment[],
  ): Promise<void> {
    const nextBySystem = new Map(next.map((a) => [a.system, a.role]));
    const currentBySystem = new Map(current.map((a) => [a.system, a.role]));

    const removed = current
      .filter((a) => !nextBySystem.has(a.system))
      .map((a) => a.system);
    if (removed.length > 0)
      await manager.delete(UserSystemEntity, {
        userId,
        systemCode: In(removed),
      });

    for (const { system, role } of next) {
      const previous = currentBySystem.get(system);
      if (previous === undefined)
        await manager.insert(UserSystemEntity, {
          userId,
          systemCode: system,
          role,
        });
      else if (previous !== role)
        await manager.update(
          UserSystemEntity,
          { userId, systemCode: system },
          { role, updatedAt: () => 'now()' },
        );
    }
  }

  private async revokeRefreshSessions(
    manager: EntityManager,
    userId: string,
    systems?: SystemCode[],
  ): Promise<void> {
    await manager.query(
      `UPDATE refresh_sessions
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE user_id = $1
          AND ($2::varchar[] IS NULL OR system_code = ANY($2::varchar[]))`,
      [userId, systems?.length ? systems : null],
    );
  }

  private async recordChange(
    manager: EntityManager,
    view: UserView,
    change: {
      eventType: UserEventType | null;
      action: AuditAction;
      actorUserId: string | null;
      correlationId: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    if (change.eventType)
      await enqueueUserEvent(
        manager,
        buildUserEvent({
          eventType: change.eventType,
          snapshot: toSnapshot(view),
          entityVersion: view.version,
          correlationId: change.correlationId,
          occurredAt: new Date(),
        }),
      );
    await recordAudit(manager, {
      actorUserId: change.actorUserId,
      action: change.action,
      targetType: 'USER',
      targetKey: view.id,
      targetVersion: view.version,
      requestId: change.correlationId,
      details: change.details,
    });
  }

  private async loadView(
    manager: EntityManager,
    id: string,
  ): Promise<UserView | null> {
    const user = await manager.findOne(UserEntity, { where: { id } });
    if (!user) return null;
    const rows = await manager.find(UserSystemEntity, {
      where: { userId: id },
    });
    return toView(user, toAssignments(rows));
  }
}
