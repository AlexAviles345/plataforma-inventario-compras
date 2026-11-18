import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertValidUserEvent,
  buildUserEvent,
  InvalidUserEventError,
  type PublicUserSnapshot,
  type UserEvent,
} from './user-event';

const CONTRACTS = join(__dirname, '../../../../../contracts/events');
const LOCAL = join(__dirname, 'schemas');

const readJson = (dir: string, file: string): unknown =>
  JSON.parse(readFileSync(join(dir, file), 'utf8'));

const snapshot = (
  overrides: Partial<PublicUserSnapshot> = {},
): PublicUserSnapshot => ({
  userId: randomUUID(),
  email: 'usuario@techdistribution.com',
  displayName: 'Usuario de inventario',
  active: true,
  assignments: [{ system: 'INVENTORY', role: 'INVENTORY_MANAGER' }],
  ...overrides,
});

const build = (data = snapshot()) =>
  buildUserEvent({
    eventType: 'UserCreated',
    snapshot: data,
    entityVersion: 1,
    correlationId: randomUUID(),
    occurredAt: new Date('2026-11-08T18:00:00Z'),
  });

describe('user event schemas', () => {
  it.each(['event-envelope.schema.json', 'user-event.schema.json'])(
    'keeps %s identical to contracts/events',
    (file) => {
      expect(readJson(LOCAL, file)).toEqual(readJson(CONTRACTS, file));
    },
  );
});

describe('buildUserEvent', () => {
  it('builds a v1 event keyed by the user id', () => {
    const data = snapshot();
    const event = build(data);
    expect(event).toMatchObject({
      eventType: 'UserCreated',
      schemaVersion: 1,
      aggregateId: data.userId,
      entityVersion: 1,
      timestamp: '2026-11-08T18:00:00.000Z',
      data,
    });
  });

  it('copies only the public snapshot fields', () => {
    const leaky = {
      ...snapshot(),
      passwordHash: '$argon2id$...',
    } as PublicUserSnapshot;
    expect(Object.keys(build(leaky).data).sort()).toEqual([
      'active',
      'assignments',
      'displayName',
      'email',
      'userId',
    ]);
  });

  it('accepts a user without assignments and with both systems', () => {
    expect(() => build(snapshot({ assignments: [] }))).not.toThrow();
    expect(() =>
      build(
        snapshot({
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a role outside the system matrix', () => {
    expect(() =>
      build(
        snapshot({
          assignments: [{ system: 'INVENTORY', role: 'PURCHASES_AGENT' }],
        }),
      ),
    ).toThrow(InvalidUserEventError);
  });

  it('rejects two assignments for the same system', () => {
    expect(() =>
      build(
        snapshot({
          assignments: [
            { system: 'INVENTORY', role: 'ADMIN' },
            { system: 'INVENTORY', role: 'INVENTORY_MANAGER' },
          ],
        }),
      ),
    ).toThrow(/una sola asignación por sistema/);
  });
});

describe('assertValidUserEvent', () => {
  const valid = (): UserEvent => build();

  it('rejects unexpected properties such as secrets', () => {
    const event = valid();
    (event.data as unknown as Record<string, unknown>).passwordHash = 'x';
    expect(() => assertValidUserEvent(event)).toThrow(InvalidUserEventError);
  });

  it('rejects an aggregateId different from data.userId', () => {
    expect(() =>
      assertValidUserEvent({ ...valid(), aggregateId: randomUUID() }),
    ).toThrow(/aggregateId/);
  });

  it.each<[string, Partial<UserEvent>]>([
    ['a timestamp without Z', { timestamp: '2026-11-08T18:00:00+01:00' }],
    ['a non-UUID correlationId', { correlationId: 'abc' }],
    ['entityVersion 0', { entityVersion: 0 }],
    ['a product event type', { eventType: 'ProductCreated' as never }],
  ])('rejects %s', (_case, overrides) => {
    expect(() => assertValidUserEvent({ ...valid(), ...overrides })).toThrow(
      InvalidUserEventError,
    );
  });

  it('rejects an invalid email in the snapshot', () => {
    const event = valid();
    event.data.email = 'no-es-email';
    expect(() => assertValidUserEvent(event)).toThrow(InvalidUserEventError);
  });
});
