/** Verify real local accounts, fail-closed sessions and transactional signup. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_USERS, USERS_KEY, SESSION_KEY, validUsers } from '../demo/mockData';
import { readCandidate, validateProfile, saveProfile } from '../candidate/profile';
import {
  AUTH_KEY, INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, LOGOUT_STORAGE_ERROR, REGISTER_STORAGE_ERROR,
  readUsers, readSession, isAuthenticated, login, logout, registerCandidate,
} from './auth';

const signup = { fullName: 'New Candidate', email: 'new@example.com', mobile: '0123456789', password: 'password123' };
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('readUsers and readSession', () => {
  it('reads stored accounts and returns empty for missing users', () => {
    expect(readUsers()).toEqual(DEFAULT_USERS);
    localStorage.removeItem(USERS_KEY);
    expect(readUsers()).toEqual([]);
  });
  it.each(['{bad', 'null', '{}', '[{}]', JSON.stringify([...DEFAULT_USERS, DEFAULT_USERS[0]])])('rejects malformed accounts %s', (raw) => {
    localStorage.setItem(USERS_KEY, raw);
    expect(() => readUsers()).toThrow();
    expect(readSession()).toBeNull();
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
  });
  it('fails closed when the session is absent or legacy-only', () => {
    expect(isAuthenticated()).toBe(false);
    sessionStorage.setItem(AUTH_KEY, 'true');
    expect(readSession()).toBeNull();
  });
  it.each(['false', '', 'TRUE', 'True', '1', ' true ', 'null', '{}', 'admin', 'true', '[]', '{bad'])('rejects stored session %j', (value) => {
    localStorage.setItem(SESSION_KEY, value);
    expect(readSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
  it.each([
    { userId: 'missing' }, { role: 'candidate' }, { role: 'owner' }, { displayName: 'Forged' },
    { loginTimestamp: 'invalid' }, { loginTimestamp: 123 }, { loginTimestamp: '123' },
    { loginTimestamp: '2026-02-30T00:00:00.000Z' }, { loginTimestamp: '2026-10-20' },
    { userId: null }, { extra: 'untrusted' },
  ])('rejects a mismatched session field %j', (patch) => {
    login('admin', 'admin');
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...readSession(), ...patch }));
    expect(readSession()).toBeNull();
  });
  it('rejects sessions missing any required identity field', () => {
    login('admin', 'admin');
    const identity = readSession();
    for (const key of Object.keys(identity)) {
      const copy = { ...identity }; delete copy[key];
      localStorage.setItem(SESSION_KEY, JSON.stringify(copy));
      expect(readSession()).toBeNull();
    }
  });
  it('requeries identity after changes rather than caching', () => {
    expect(isAuthenticated()).toBe(false);
    login('admin', 'admin'); expect(isAuthenticated()).toBe(true);
    localStorage.setItem(SESSION_KEY, 'false'); expect(isAuthenticated()).toBe(false);
    login('admin', 'admin'); expect(isAuthenticated()).toBe(true);
    localStorage.removeItem(SESSION_KEY); expect(isAuthenticated()).toBe(false);
  });
  it('rejects an account removed or changed after login', () => {
    login('admin', 'admin');
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS.slice(1)));
    expect(readSession()).toBeNull();
  });
  it.each(['read', 'getter'])('fails closed on unavailable storage %s', (failure) => {
    login('admin', 'admin');
    if (failure === 'read') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    else vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => readUsers()).toThrow();
    expect(readSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
  });
});

describe('login', () => {
  it.each(DEFAULT_USERS.map((user) => [user.username, user.password, user.role, user.id, user.displayName]))(
    'authenticates supplied %s credentials with the correct identity', (username, password, role, userId, displayName) => {
      const accounts = localStorage.getItem(USERS_KEY);
      expect(login(username, password, role)).toEqual({ success: true, error: '' });
      expect(readSession()).toEqual({ userId, role, displayName, loginTimestamp: expect.any(String) });
      expect(new Date(readSession().loginTimestamp).toISOString()).toBe(readSession().loginTimestamp);
      expect(isAuthenticated(role)).toBe(true);
      expect(isAuthenticated(role === 'admin' ? 'candidate' : 'admin')).toBe(false);
      expect(localStorage.length).toBe(2);
      expect(localStorage.getItem(USERS_KEY)).toBe(accounts);
      expect(sessionStorage.length).toBe(0);
    },
  );
  it('keeps two-argument admin login compatible and persists after sessionStorage clears', () => {
    expect(login('admin', 'admin')).toEqual({ success: true, error: '' });
    sessionStorage.clear();
    expect(isAuthenticated()).toBe(true);
    expect(readSession().userId).toBe('u-admin');
  });
  it.each([
    ['wrong', 'admin'], ['admin', 'wrong'], ['wrong', 'wrong'], ['', ''], ['', 'admin'], ['admin', ''],
    ['Admin', 'admin'], ['admin', 'Admin'], [' admin', 'admin'], ['admin', 'admin '],
    [undefined, undefined], [null, null], [123, 123], [{}, []],
    ['admin', 'admin', 'candidate'], ['alex@example.com', 'password123', 'admin'],
    ['admin', 'admin', 'owner'], ['admin', 'admin', null],
  ])('rejects %j / %j / %j without altering existing storage', (username, password, role = 'admin') => {
    const accounts = localStorage.getItem(USERS_KEY);
    expect(login(username, password, role)).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(USERS_KEY)).toBe(accounts);
    expect(isAuthenticated()).toBe(false);
  });
  it('never writes on invalid credentials even when writes are blocked', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(login('wrong', 'wrong')).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(write).not.toHaveBeenCalled(); expect(isAuthenticated()).toBe(false);
  });
  it('preserves an existing identity on failed credentials', () => {
    login('admin', 'admin'); const previous = localStorage.getItem(SESSION_KEY);
    expect(login('wrong', 'wrong').success).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBe(previous);
  });
  it('reports quota failure without granting access', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(isAuthenticated()).toBe(false);
  });
});

describe('logout', () => {
  it('removes only the session, preserves unrelated data and allows relogin', () => {
    localStorage.setItem('unrelated', 'keep'); login('admin', 'admin');
    const accounts = localStorage.getItem(USERS_KEY);
    expect(logout()).toEqual({ success: true, error: '' });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(localStorage.getItem(USERS_KEY)).toBe(accounts); expect(isAuthenticated()).toBe(false);
    expect(login('admin', 'admin').success).toBe(true); expect(isAuthenticated()).toBe(true);
  });
  it('succeeds idempotently when already absent', () => {
    expect(logout()).toEqual({ success: true, error: '' });
    expect(logout()).toEqual({ success: true, error: '' }); expect(isAuthenticated()).toBe(false);
  });
  it('retains the identity on removal failure and permits retry', () => {
    login('admin', 'admin'); const identity = readSession();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(logout()).toEqual({ success: false, error: LOGOUT_STORAGE_ERROR });
    expect(readSession()).toEqual(identity); expect(isAuthenticated()).toBe(true);
    remove.mockRestore(); expect(logout().success).toBe(true); expect(readSession()).toBeNull();
  });
  it('reports unavailable localStorage honestly', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(logout()).toEqual({ success: false, error: LOGOUT_STORAGE_ERROR });
  });
});

describe('registerCandidate', () => {
  it('normalizes name/email and retains validated mobile with an immediate candidate session', () => {
    expect(registerCandidate({ ...signup, fullName: ' New Candidate ', email: ' NEW@example.com ' })).toEqual({ success: true, error: '' });
    expect(validUsers(readUsers())).toBe(true);
    expect(readUsers()).toHaveLength(6);
    const account = readUsers().at(-1);
    expect(account).toEqual({ id: expect.any(String), role: 'candidate', username: signup.email, password: signup.password, displayName: signup.fullName, mobile: signup.mobile });
    expect(readSession()).toEqual({ userId: account.id, role: 'candidate', displayName: signup.fullName, loginTimestamp: expect.any(String) });
    expect(isAuthenticated()).toBe(false); expect(isAuthenticated('candidate')).toBe(true);
    logout(); expect(login(signup.email, signup.password, 'candidate').success).toBe(true);
  });
  it.each(['fullName', 'email', 'mobile', 'password'])('rejects omitted %s with a meaningful error and unchanged accounts/session', (field) => {
    expect(login('admin', 'admin').success).toBe(true);
    const previousUsers = localStorage.getItem(USERS_KEY);
    const previousSession = localStorage.getItem(SESSION_KEY);
    const input = { ...signup };
    delete input[field];
    const result = registerCandidate(input);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Enter a name, email, mobile number and password.');
    expect(localStorage.getItem(USERS_KEY)).toBe(previousUsers);
    expect(localStorage.getItem(SESSION_KEY)).toBe(previousSession);
  });
  it.each([null, undefined, [], {}, { ...signup, fullName: 1 }, { ...signup, email: null }, { ...signup, mobile: {} }, { ...signup, password: [] }])('rejects missing/invalid input types %j', (input) => {
    const before = localStorage.getItem(USERS_KEY);
    expect(registerCandidate(input).success).toBe(false);
    expect(localStorage.getItem(USERS_KEY)).toBe(before); expect(readSession()).toBeNull();
  });
  it.each([
    ['fullName', ''], ['fullName', '   '], ['fullName', 'a'.repeat(101)], ['fullName', 'Alex2'], ['fullName', '<script>'],
    ['email', 'bad'], ['email', 'a@b'], ['email', 'a @b.com'], ['email', '<a>@b.com'], ['email', 'a'.repeat(249) + '@b.com'], ['email', 'a'.repeat(255) + '@b.com'],
    ['mobile', ''], ['mobile', '123456789'], ['mobile', '1234567890123456'], ['mobile', 'abcdefghij'], ['mobile', '123abc4567890'],
    ['password', '1234567'], ['password', '        '],
  ])('rejects invalid %s %j without writes', (field, value) => {
    const before = localStorage.getItem(USERS_KEY);
    expect(registerCandidate({ ...signup, [field]: value }).success).toBe(false);
    expect(localStorage.getItem(USERS_KEY)).toBe(before); expect(readSession()).toBeNull();
  });
  it.each(['(012) 345-6789', '012 345 6789', '012-345-6789'])('accepts validation boundaries and normalizes formatted ten-digit mobile %s without truncation', (mobile) => {
    expect(registerCandidate({ ...signup, fullName: 'a'.repeat(100), email: 'a'.repeat(248) + '@b.com', password: '12345678', mobile }).success).toBe(true);
    expect(JSON.parse(localStorage.getItem(USERS_KEY)).at(-1)).toMatchObject({ mobile: '0123456789', displayName: 'a'.repeat(100), username: 'a'.repeat(248) + '@b.com' });
    expect(readSession()).not.toBeNull();
  });
  it('allows a newly registered contact to be read and saved unchanged by profile validation', () => {
    expect(registerCandidate({ ...signup, mobile: '(012) 345-6789' }).success).toBe(true);
    const { password: _password, ...contact } = signup;
    expect(readCandidate()).toMatchObject({ success: true, profile: contact, applications: [] });
    expect(validateProfile(readCandidate().profile)).toEqual({ values: contact, errors: {} });
    expect(saveProfile(readSession().userId, readCandidate().profile)).toEqual({ success: true, error: '' });
    expect(readCandidate().profile).toEqual(contact);
    expect(readUsers().at(-1)).toMatchObject({ displayName: contact.fullName, username: contact.email, mobile: contact.mobile });
  });
  it.each(['12345678901', '123456789012', '1234567890123', '12345678901234', '123456789012345', '+1 (415) 555-2671'])('rejects longer mobile %s with actionable guidance and no account/session mutation', (mobile) => {
    expect(login('admin', 'admin').success).toBe(true);
    const before = [localStorage.getItem(USERS_KEY), localStorage.getItem(SESSION_KEY)];
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(registerCandidate({ ...signup, mobile })).toEqual({ success: false, error: 'Enter exactly 10 digits for your mobile number, without a country code. Spaces, parentheses and hyphens are allowed and removed when saved.' });
    expect([localStorage.getItem(USERS_KEY), localStorage.getItem(SESSION_KEY)]).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('rejects duplicate emails case-insensitively without changing identity or accounts', () => {
    login('admin', 'admin'); const before = localStorage.getItem(USERS_KEY); const session = readSession();
    expect(registerCandidate({ ...signup, email: ' ALEX@EXAMPLE.COM ' }).error).toContain('already exists');
    expect(localStorage.getItem(USERS_KEY)).toBe(before); expect(readSession()).toEqual(session);
  });
  it.each(['getter', 'read', 'write'])('reports account storage %s failure without fake signup', (failure) => {
    if (failure === 'getter') vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    else vi.spyOn(Storage.prototype, failure === 'read' ? 'getItem' : 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(registerCandidate(signup)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR });
    expect(readSession()).toBeNull();
  });
  it.each([true, false])('rolls back the exact previous users store after session quota failure (existing=%s)', (existing) => {
    if (!existing) localStorage.removeItem(USERS_KEY);
    else localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS, null, 2));
    const before = localStorage.getItem(USERS_KEY);
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_KEY) throw new Error('quota');
      return set.call(this, key, value);
    });
    expect(registerCandidate(signup)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR });
    expect(localStorage.getItem(USERS_KEY)).toBe(before); expect(readSession()).toBeNull();
  });
  it('preserves an existing session when signup session persistence fails', () => {
    login('admin', 'admin');
    const previousSession = localStorage.getItem(SESSION_KEY);
    const previousUsers = localStorage.getItem(USERS_KEY);
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_KEY) throw new Error('quota');
      return set.call(this, key, value);
    });
    expect(registerCandidate(signup)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR });
    expect(localStorage.getItem(SESSION_KEY)).toBe(previousSession);
    expect(localStorage.getItem(USERS_KEY)).toBe(previousUsers);
    expect(isAuthenticated()).toBe(true);
  });
  it.each(['{bad', 'null', '{}', '[{}]'])('preserves corrupt account storage %s rather than overwriting it during signup', (raw) => {
    localStorage.setItem(USERS_KEY, raw);
    expect(registerCandidate(signup)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR });
    expect(localStorage.getItem(USERS_KEY)).toBe(raw);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
  it('reports rollback failure for an initially absent users store', () => {
    localStorage.removeItem(USERS_KEY);
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_KEY) throw new Error('quota');
      return set.call(this, key, value);
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    const result = registerCandidate(signup);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rollback also failed');
    expect(readUsers()).toHaveLength(1);
    expect(readSession()).toBeNull();
  });
  it('reports rollback failure explicitly rather than claiming success', () => {
    const set = Storage.prototype.setItem; let writes = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (++writes > 1) throw new Error('blocked');
      return set.call(this, key, value);
    });
    const result = registerCandidate(signup);
    expect(result.success).toBe(false); expect(result.error).toContain('rollback also failed');
    expect(readSession()).toBeNull(); expect(readUsers()).toHaveLength(6);
  });
});
