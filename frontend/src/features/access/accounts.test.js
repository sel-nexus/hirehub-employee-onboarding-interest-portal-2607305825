/** Verify real browser persistence, validation, role isolation and failed writes. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { authenticate, register, validateContact, readSession, currentUser, requireRole, logout } from './accounts';
import { readUsers, USERS_KEY, SESSION_KEY } from '../demo/storage';

const details = { fullName: 'Casey Quinn', email: 'casey@example.com', mobile: '2025550199', password: 'password123' };
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  logout();
  readUsers();
});
afterEach(() => { vi.restoreAllMocks(); logout(); localStorage.clear(); });

/** Throw only at the selected storage boundary, retaining real storage otherwise. */
function failWrite(key) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
    if (name === key) throw new Error('Quota');
    return original.call(this, name, value);
  });
}

describe('demo accounts', () => {
  it.each([
    ['alex@example.com', 'password123', 'candidate', 'Alex Morgan'],
    ['jordan@example.com', 'password123', 'candidate', 'Jordan Lee'],
    ['taylor@example.com', 'password123', 'candidate', 'Taylor Brooks'],
    ['admin', 'admin', 'admin', 'Demo Administrator'],
    ['recruiter@hirehub.demo', 'admin123', 'admin', 'Demo Recruiter'],
  ])('persists exact session and resolves %s', (username, password, role, displayName) => {
    expect(authenticate(` ${username.toUpperCase()} `, password, role).success).toBe(true);
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    expect(Object.keys(saved).sort()).toEqual(['displayName', 'loginTimestamp', 'role', 'userId']);
    expect(saved).toMatchObject({ displayName, role });
    expect(new Date(saved.loginTimestamp).toISOString()).toBe(saved.loginTimestamp);
    expect(readSession().data).toEqual(saved);
    expect(currentUser().data.username).toBe(username);
    expect(requireRole(role).success).toBe(true);
    expect(requireRole(role === 'admin' ? 'candidate' : 'admin').success).toBe(false);
  });

  it.each([
    ['admin', ' admin', 'admin'], ['admin', 'admin ', 'admin'], ['admin', 'wrong', 'admin'],
    ['admin', 'admin', 'candidate'], ['missing', 'admin', 'admin'], ['', '', 'admin'],
    [null, 'admin', 'admin'], ['admin', null, 'admin'], ['admin', 'admin', 'root'],
  ])('rejects invalid credentials %j without creating access', (username, password, role) => {
    expect(authenticate(username, password, role).success).toBe(false);
    expect(readSession().data).toBeNull();
    expect(currentUser().success).toBe(false);
  });

  it('registers canonical exact users and session without touching unrelated storage', () => {
    localStorage.setItem('theme', 'dark');
    expect(register({ ...details, fullName: ' Casey Quinn ', email: ' CASEY@EXAMPLE.COM ' }).success).toBe(true);
    const user = JSON.parse(localStorage.getItem(USERS_KEY)).find((item) => item.username === details.email);
    expect(Object.keys(user).sort()).toEqual(['displayName', 'email', 'fullName', 'id', 'mobile', 'password', 'role', 'username']);
    expect(user).toMatchObject({ ...details, role: 'candidate', username: details.email, displayName: details.fullName });
    expect(readSession().data.userId).toBe(user.id);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(logout().success).toBe(true);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(requireRole('candidate').success).toBe(false);
    expect(authenticate(details.email, details.password, 'candidate').success).toBe(true);
  });

  it.each([' ALEX@EXAMPLE.COM ', 'admin@hirehub.demo'])('rejects duplicate email %s case-insensitively', (email) => {
    const before = localStorage.getItem(USERS_KEY);
    expect(register({ ...details, email }).fields.email).toBeTruthy();
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });

  it.each([
    ['fullName', ''], ['fullName', 42], ['fullName', '<script>'], ['fullName', 'A'.repeat(101)],
    ['email', ''], ['email', 'bad@email'], ['email', '<a>@b.com'], ['email', 'a'.repeat(255) + '@b.com'],
    ['mobile', '123'], ['mobile', 2025550199], ['mobile', '12345678901'],
    ['password', 'short'], ['password', null], ['password', 'password123 '], ['password', 'a'.repeat(201)],
  ])('rejects invalid %s %j without writes', (field, value) => {
    const before = localStorage.getItem(USERS_KEY);
    expect(register({ ...details, [field]: value }).fields[field]).toBeTruthy();
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
    expect(readSession().data).toBeNull();
  });

  it('validates missing details and canonical contact boundaries for reuse', () => {
    expect(Object.keys(validateContact(null))).toHaveLength(3);
    expect(Object.keys(register().fields)).toHaveLength(4);
    expect(validateContact(details)).toEqual({});
    expect(register({ ...details, password: '12345678', fullName: 'A'.repeat(100) }).success).toBe(true);
  });

  describe('independent required-field validation', () => {
    const errors = {
      fullName: 'Enter a name using letters and spaces (up to 100 characters).',
      email: 'Enter a valid email address (up to 254 characters).',
      mobile: 'Enter a 10-digit mobile number.',
      password: 'Use 8–200 characters without leading or trailing spaces.',
    };
    const invalidValues = [
      ['deleted', undefined], ['undefined', undefined], ['null', null],
      ['number', 42], ['boolean', true], ['object', {}], ['array', []],
      ['empty', ''], ['whitespace-only', ' \t\n '],
    ];
    const registrationCases = Object.keys(errors).flatMap((field) =>
      invalidValues.map(([kind, value]) => [field, kind, value]));
    const contactCases = registrationCases.filter(([field]) => field !== 'password');
    const rejectedBoundaries = [
      ['fullName', 'over maximum (101)', 'A'.repeat(101)],
      ['email', 'over maximum (255)', 'a'.repeat(249) + '@b.com'],
      ['mobile', 'below exact length (9)', '123456789'],
      ['mobile', 'above exact length (11)', '12345678901'],
      ['password', 'below minimum (7)', 'a'.repeat(7)],
      ['password', 'over maximum (201)', 'a'.repeat(201)],
    ];
    const acceptedBoundaries = [
      ['fullName', 'minimum nonblank (1)', 'A'],
      ['fullName', 'maximum (100)', 'A'.repeat(100)],
      ['email', 'maximum (254)', 'a'.repeat(248) + '@b.com'],
      ['mobile', 'exact length (10)', '1234567890'],
      ['password', 'minimum (8)', 'a'.repeat(8)],
      ['password', 'maximum (200)', 'a'.repeat(200)],
    ];

    it.each([...registrationCases, ...rejectedBoundaries])(
      'rejects registration %s with %s, preserving users and active session', (field, kind, value) => {
        expect(authenticate('admin', 'admin', 'admin').success).toBe(true);
        const usersBefore = localStorage.getItem(USERS_KEY);
        const sessionBefore = localStorage.getItem(SESSION_KEY);
        const input = { ...details, [field]: value };
        if (kind === 'deleted') delete input[field];

        const result = register(input);

        expect(result).toMatchObject({ success: false, data: null, error: 'Check the highlighted fields.' });
        expect(result.fields).toEqual({ [field]: errors[field] });
        expect(localStorage.getItem(USERS_KEY)).toBe(usersBefore);
        expect(localStorage.getItem(SESSION_KEY)).toBe(sessionBefore);
      });

    it.each([...contactCases, ...rejectedBoundaries.filter(([field]) => field !== 'password')])(
      'rejects contact %s with %s, preserving users and active session', (field, kind, value) => {
        expect(authenticate('admin', 'admin', 'admin').success).toBe(true);
        const usersBefore = localStorage.getItem(USERS_KEY);
        const sessionBefore = localStorage.getItem(SESSION_KEY);
        const { password, ...contact } = details;
        const input = { ...contact, [field]: value };
        if (kind === 'deleted') delete input[field];

        expect(validateContact(input)).toEqual({ [field]: errors[field] });
        expect(localStorage.getItem(USERS_KEY)).toBe(usersBefore);
        expect(localStorage.getItem(SESSION_KEY)).toBe(sessionBefore);
      });

    it.each(acceptedBoundaries)(
      'accepts registration %s at %s with all other fields valid', (field, boundary, value) => {
        const input = { ...details, [field]: value };

        expect(register(input).success).toBe(true);

        const users = JSON.parse(localStorage.getItem(USERS_KEY));
        const user = users.find((item) => item.email === input.email);
        expect(user).toMatchObject({ ...input, role: 'candidate', username: input.email });
        expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toMatchObject({
          userId: user.id, role: 'candidate', displayName: input.fullName,
        });
      });

    it.each(acceptedBoundaries.filter(([field]) => field !== 'password'))(
      'accepts contact %s at %s without changing users or session', (field, boundary, value) => {
        expect(authenticate('admin', 'admin', 'admin').success).toBe(true);
        const usersBefore = localStorage.getItem(USERS_KEY);
        const sessionBefore = localStorage.getItem(SESSION_KEY);
        const { password, ...contact } = details;

        expect(validateContact({ ...contact, [field]: value })).toEqual({});
        expect(localStorage.getItem(USERS_KEY)).toBe(usersBefore);
        expect(localStorage.getItem(SESSION_KEY)).toBe(sessionBefore);
      });
  });

  it.each([{}, [], { userId: 'user-alex', role: 'admin', displayName: 'Alex Morgan', loginTimestamp: new Date().toISOString() },
    { userId: 'missing', role: 'candidate', displayName: 'Alex Morgan', loginTimestamp: new Date().toISOString() },
    { userId: 'user-alex', role: 'candidate', displayName: 'Other', loginTimestamp: new Date().toISOString() },
    { userId: 'user-alex', role: 'candidate', displayName: 'Alex Morgan', loginTimestamp: 'yesterday' }])(
    'recovers malformed session %j to signed out', (session) => {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      expect(readSession().data).toBeNull();
      expect(currentUser().success).toBe(false);
      expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toBeNull();
    });

  it('recovers corrupt JSON and surfaces warnings', () => {
    localStorage.setItem(SESSION_KEY, '{');
    expect(readSession().warning).toContain('Corrupted');
    localStorage.setItem(USERS_KEY, '{');
    expect(authenticate('admin', 'admin', 'admin').warning).toContain('Corrupted');
    expect(requireRole('root').success).toBe(false);
  });

  it('fails closed on read failure and does not write registration', () => {
    authenticate('admin', 'admin', 'admin');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(readSession()).toMatchObject({ success: false, data: null });
    expect(currentUser().success).toBe(false);
    expect(requireRole('admin').success).toBe(false);
    expect(authenticate('admin', 'admin', 'admin').success).toBe(false);
    expect(register(details).success).toBe(false);
    spy.mockRestore();
  });

  it('reports user-save failure without changing stored users', () => {
    const before = localStorage.getItem(USERS_KEY);
    failWrite(USERS_KEY);
    expect(register(details).success).toBe(false);
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });

  it('rolls back registration when session save fails', () => {
    const before = localStorage.getItem(USERS_KEY);
    failWrite(SESSION_KEY);
    const result = register(details);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rolled back');
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
    expect(readSession().data).toBeNull();
  });

  it('reports failed rollback instead of claiming registration success', () => {
    const original = Storage.prototype.setItem;
    let userWrites = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_KEY || (key === USERS_KEY && ++userWrites > 1)) throw new Error('Quota');
      original.call(this, key, value);
    });
    expect(register(details).error).toContain('rollback failed');
    expect(JSON.parse(localStorage.getItem(USERS_KEY)).some((item) => item.email === details.email)).toBe(true);
    expect(requireRole('candidate').success).toBe(false);
  });

  it('blocks old session after a failed new session write', () => {
    authenticate('admin', 'admin', 'admin');
    const spy = failWrite(SESSION_KEY);
    expect(authenticate('alex@example.com', 'password123', 'candidate').success).toBe(false);
    expect(requireRole('admin').success).toBe(false);
    spy.mockRestore();
    expect(authenticate('alex@example.com', 'password123', 'candidate').success).toBe(true);
  });

  it('blocks stale access on failed removal then retries logout', () => {
    authenticate('admin', 'admin', 'admin');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(logout().success).toBe(false);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).role).toBe('admin');
    expect(readSession().data).toBeNull();
    expect(requireRole('admin').success).toBe(false);
    remove.mockRestore();
    expect(logout().success).toBe(true);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
