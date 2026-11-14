import { AuthDomainError } from '../common/errors';
import {
  displayNameViolations,
  emailViolations,
  normalizeDisplayName,
  normalizeEmail,
  passwordViolations,
  sameAssignments,
  throwIfInvalid,
  validateAssignments,
} from './user-rules';

describe('email', () => {
  it('normalizes with trim and lowercase', () => {
    expect(normalizeEmail('  Admin@TechDistribution.COM ')).toBe(
      'admin@techdistribution.com',
    );
  });

  it.each(['a@b.co', 'nombre.apellido+tag@empresa.com.mx'])(
    'accepts %s',
    (email) => {
      expect(emailViolations(email)).toEqual([]);
    },
  );

  it.each(['', 'sin-arroba', 'a@b', 'a b@c.com', 'a@@b.com'])(
    'rejects %p',
    (email) => {
      expect(emailViolations(email)).toEqual([
        expect.objectContaining({ field: 'email', code: 'INVALID_EMAIL' }),
      ]);
    },
  );

  it('rejects emails longer than 254 characters', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
    expect(emailViolations(email)).toEqual([
      expect.objectContaining({ code: 'INVALID_LENGTH' }),
    ]);
  });
});

describe('displayName', () => {
  it('trims and accepts 1 to 200 characters', () => {
    expect(normalizeDisplayName('  Ana  ')).toBe('Ana');
    expect(displayNameViolations('A')).toEqual([]);
    expect(displayNameViolations('é'.repeat(200))).toEqual([]);
  });

  it.each(['', 'x'.repeat(201)])('rejects length %#', (name) => {
    expect(displayNameViolations(name)).toEqual([
      expect.objectContaining({ field: 'displayName', code: 'INVALID_LENGTH' }),
    ]);
  });
});

describe('password', () => {
  it.each(['Ab1!xyz9', 'una frase bastante larga', 'x'.repeat(7) + 'y'])(
    'accepts %p',
    (password) => {
      expect(passwordViolations(password)).toEqual([]);
    },
  );

  it('counts characters, not bytes, and keeps spaces', () => {
    expect(passwordViolations('ñandú🔒xy')).toEqual([]);
    expect(passwordViolations(' abc12 ')).toEqual([
      expect.objectContaining({ code: 'INVALID_LENGTH' }),
    ]);
  });

  it.each(['1234567', 'x'.repeat(129)])('rejects length %#', (password) => {
    expect(passwordViolations(password)).toEqual([
      expect.objectContaining({ field: 'password', code: 'INVALID_LENGTH' }),
    ]);
  });

  it.each(['password', 'PassWord123', '12345678', 'qwertyuiop', 'zzzzzzzzzz'])(
    'rejects the common password %p',
    (password) => {
      expect(passwordViolations(password)).toEqual([
        expect.objectContaining({ code: 'COMMON_PASSWORD' }),
      ]);
    },
  );

  it('never echoes the password in the message', () => {
    const [detail] = passwordViolations('password123');
    expect(detail.message).not.toContain('password123');
  });
});

describe('validateAssignments', () => {
  it('accepts the role matrix and sorts by system', () => {
    expect(
      validateAssignments([
        { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
        { system: 'INVENTORY', role: 'ADMIN' },
      ]),
    ).toEqual({
      assignments: [
        { system: 'INVENTORY', role: 'ADMIN' },
        { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
      ],
      details: [],
    });
  });

  it('allows an empty list', () => {
    expect(validateAssignments([])).toEqual({ assignments: [], details: [] });
  });

  it('reports each problem with its client path', () => {
    const { details } = validateAssignments([
      { system: 'INVENTORY', role: 'PURCHASES_AGENT' },
      { system: 'BILLING', role: 'ADMIN' },
      { system: 'PURCHASES', role: 'ADMIN' },
      { system: 'PURCHASES', role: 'PURCHASES_AGENT' },
    ]);
    expect(details.map(({ field, code }) => [field, code])).toEqual([
      ['assignments[0].role', 'ROLE_NOT_ALLOWED_FOR_SYSTEM'],
      ['assignments[1].system', 'INVALID_SYSTEM'],
      ['assignments[3].system', 'DUPLICATE_SYSTEM'],
    ]);
  });

  it('compares assignments regardless of order', () => {
    const a = [
      { system: 'INVENTORY', role: 'ADMIN' },
      { system: 'PURCHASES', role: 'ADMIN' },
    ] as const;
    expect(sameAssignments([...a], [a[1], a[0]])).toBe(true);
    expect(
      sameAssignments([...a], [{ system: 'INVENTORY', role: 'ADMIN' }]),
    ).toBe(false);
  });
});

describe('throwIfInvalid', () => {
  it('raises a 400 VALIDATION_ERROR with every detail', () => {
    const details = [{ field: 'email', code: 'INVALID_EMAIL', message: 'x' }];
    expect(() => throwIfInvalid(details)).toThrow(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details,
      }) as AuthDomainError,
    );
    expect(() => throwIfInvalid([])).not.toThrow();
  });
});
