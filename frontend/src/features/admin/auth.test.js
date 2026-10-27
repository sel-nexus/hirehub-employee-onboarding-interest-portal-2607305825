/** Verify role credentials, current-user session validation, signup and all local storage failures. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  AUTH_KEY, INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, LOGOUT_STORAGE_ERROR,
  REGISTER_STORAGE_ERROR, REGISTRATION_ERRORS,
  getSession, isAuthenticated, login, logout, validateRegistration, registerCandidate,
} from './auth';
import { seedMockData, USERS_KEY, DEFAULT_USERS } from '../data/mockData';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  seedMockData();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const registration = { displayName: 'New Candidate', username: 'new@example.com', password: 'password123', confirmPassword: 'password123' };

describe('getSession and isAuthenticated', () => {
  it('fails closed for missing session and does not trust old sessionStorage auth', () => {
    sessionStorage.setItem('hirehub_admin_auth', 'true');
    sessionStorage.setItem(AUTH_KEY, 'true');
    expect(AUTH_KEY).toBe('hirehub_session');
    expect(getSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
  it.each(['true', 'false', '', 'TRUE', 'True', '1', ' true ', 'null', '{}', 'admin', '[]', '"session"'])('rejects stored value %j without rewriting it', (value) => {
    localStorage.setItem(AUTH_KEY, value);
    expect(getSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_KEY)).toBe(value);
  });
  it('requeries every state change and checks the requested role', () => {
    expect(isAuthenticated()).toBe(false);
    login('admin', 'admin');
    expect(isAuthenticated()).toBe(true);
    expect(isAuthenticated('candidate')).toBe(false);
    login('alex@example.com', 'password123', 'candidate');
    expect(isAuthenticated()).toBe(false);
    expect(isAuthenticated('candidate')).toBe(true);
    expect(isAuthenticated('owner')).toBe(false);
    localStorage.removeItem(AUTH_KEY);
    expect(getSession()).toBeNull();
  });
  it.each([{ userId: 'unknown' }, { role: 'candidate' }, { role: 'owner' }, { displayName: 'Fake Admin' }, { loginTimestamp: 'invalid' }, { loginTimestamp: '2026-10-20' }, { loginTimestamp: null }, { extra: 'value' }, { userId: [] }])('rejects forged or invalid session fields %j', (fields) => {
    login('admin', 'admin');
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...getSession(), ...fields }));
    expect(getSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
  it('rejects deleted users, role changes, display-name changes and corrupt users', () => {
    login('admin', 'admin');
    const session = localStorage.getItem(AUTH_KEY);
    for (const users of [[], DEFAULT_USERS.map((user) => user.id === 'u-admin' ? { ...user, role: 'candidate' } : user), DEFAULT_USERS.map((user) => user.id === 'u-admin' ? { ...user, displayName: 'Changed' } : user)]) {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      expect(getSession()).toBeNull();
      expect(localStorage.getItem(AUTH_KEY)).toBe(session);
    }
    localStorage.setItem(USERS_KEY, '{bad');
    expect(getSession()).toBeNull();
  });
  it('fails closed on blocked reads and localStorage getter', () => {
    login('admin', 'admin');
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getSession()).toBeNull();
    expect(isAuthenticated()).toBe(false);
    read.mockRestore();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(getSession()).toBeNull();
  });
});

describe('login', () => {
  it.each([
    ['admin', 'admin', 'admin', 'u-admin'],
    ['recruiter@hirehub.demo', 'admin123', 'admin', 'u-recruiter'],
    ['alex@example.com', 'password123', 'candidate', 'u-201'],
    ['jordan@example.com', 'password123', 'candidate', 'u-202'],
    ['taylor@example.com', 'password123', 'candidate', 'u-203'],
  ])('persists source session fields for %s', (username, password, role, userId) => {
    const before = localStorage.getItem(USERS_KEY);
    const result = login(username, password, role);
    expect(result.success).toBe(true);
    expect(result.error).toBe('');
    expect(JSON.parse(localStorage.getItem(AUTH_KEY))).toEqual({ userId, role, displayName: DEFAULT_USERS.find((user) => user.id === userId).displayName, loginTimestamp: expect.any(String) });
    expect(getSession()).toEqual(result.session);
    expect(new Date(result.session.loginTimestamp).toISOString()).toBe(result.session.loginTimestamp);
    expect(isAuthenticated(role)).toBe(true);
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
    expect(sessionStorage.length).toBe(0);
  });
  it.each([
    ['wrong', 'admin'], ['admin', 'wrong'], ['wrong', 'wrong'], ['', ''], ['', 'admin'], ['admin', ''],
    ['Admin', 'admin'], ['admin', 'Admin'], [' admin', 'admin'], ['admin', 'admin '],
    [undefined, undefined], [null, null], [123, 123], [{}, []],
    ['alex@example.com', 'password123', 'admin'], ['admin', 'admin', 'candidate'],
    ['admin', 'admin', 'owner'], ['alex@example.com', 'wrong', 'candidate'],
  ])('rejects credentials %j / %j / %j without granting access', (username, password, role) => {
    expect(login(username, password, role)).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
  it('permits email case differences for candidates but never trims a password', () => {
    expect(login('ALEX@example.com', 'password123', 'candidate').success).toBe(true);
    const session = localStorage.getItem(AUTH_KEY);
    expect(login('alex@example.com', 'password123 ', 'candidate').success).toBe(false);
    expect(localStorage.getItem(AUTH_KEY)).toBe(session);
  });
  it('does not write invalid credentials even when writes are blocked', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(login('wrong', 'wrong')).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(write).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
  });
  it('reports failed session writes without access and permits retry', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
    write.mockRestore();
    expect(login('admin', 'admin').success).toBe(true);
    expect(isAuthenticated()).toBe(true);
  });
  it.each(['null', '{}', '{bad', '[{}]'])('rejects invalid users storage %s with an actionable error', (raw) => {
    localStorage.setItem(USERS_KEY, raw);
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(USERS_KEY)).toBe(raw);
  });
  it('does not recreate demo users from a deliberately empty array', () => {
    localStorage.setItem(USERS_KEY, '[]');
    expect(login('admin', 'admin')).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(localStorage.getItem(USERS_KEY)).toBe('[]');
  });
  it('reports read and getter failures rather than authenticating hardcoded credentials', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
    read.mockRestore();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
  });
});

describe('registration', () => {
  it('normalizes email/name, ignores caller role/ID and persists the candidate session immediately', () => {
    const before = localStorage.getItem('hirehub_submissions');
    const result = registerCandidate({ ...registration, username: ' NEW@Example.com ', displayName: ' New Candidate ', role: 'admin', id: 'u-admin' });
    expect(result).toMatchObject({ success: true, error: '', fieldErrors: {} });
    const users = JSON.parse(localStorage.getItem(USERS_KEY));
    expect(users).toHaveLength(DEFAULT_USERS.length + 1);
    const user = users.at(-1);
    expect(user).toEqual({ id: expect.any(String), role: 'candidate', username: 'new@example.com', displayName: 'New Candidate', password: 'password123' });
    expect(user.id).not.toBe('u-admin');
    expect(getSession()).toEqual(result.session);
    expect(getSession().userId).toBe(user.id);
    expect(isAuthenticated('candidate')).toBe(true);
    expect(isAuthenticated()).toBe(false);
    expect(localStorage.getItem('hirehub_submissions')).toBe(before);
    logout();
    expect(login('new@example.com', 'password123', 'candidate').success).toBe(true);
  });
  it.each([
    ['displayName', ''], ['displayName', 'A'], ['displayName', 'a'.repeat(101)], ['displayName', '<script>'], ['displayName', null],
    ['username', ''], ['username', 'bad'], ['username', 'a'.repeat(250) + '@example.com'], ['username', {}],
    ['password', ''], ['password', 'short'], ['password', 'a'.repeat(129)], ['password', ' password123'], ['password', []],
    ['confirmPassword', ''], ['confirmPassword', 'different'], ['confirmPassword', null],
  ])('rejects invalid %s %j and makes no storage changes', (key, value) => {
    const before = { ...localStorage };
    const input = { ...registration, [key]: value };
    expect(validateRegistration(input).errors[key]).toBe(REGISTRATION_ERRORS[key]);
    expect(registerCandidate(input)).toMatchObject({ success: false, fieldErrors: { [key]: REGISTRATION_ERRORS[key] } });
    expect({ ...localStorage }).toEqual(before);
  });
  it.each([undefined, null, [], 1, 'input', {}])('rejects missing or non-object signup %j', (input) => {
    expect(Object.keys(validateRegistration(input).errors)).toEqual(['displayName', 'username', 'password', 'confirmPassword']);
    expect(registerCandidate(input).success).toBe(false);
    expect(getSession()).toBeNull();
  });
  it('accepts exact boundary lengths without silently truncating values', () => {
    const input = { ...registration, displayName: 'a'.repeat(100), password: 'a'.repeat(128), confirmPassword: 'a'.repeat(128) };
    expect(validateRegistration(input).errors).toEqual({});
    expect(registerCandidate(input).success).toBe(true);
    expect(getSession().displayName).toHaveLength(100);
    expect(validateRegistration({ ...registration, displayName: 'Jo', password: '12345678', confirmPassword: '12345678' }).errors).toEqual({});
  });
  it('rejects duplicate emails across roles case-insensitively without replacing accounts/session', () => {
    login('admin', 'admin');
    const before = { ...localStorage };
    const result = registerCandidate({ ...registration, username: ' RECRUITER@hirehub.demo ' });
    expect(result).toEqual({ success: false, error: REGISTRATION_ERRORS.duplicate, fieldErrors: { username: REGISTRATION_ERRORS.duplicate } });
    expect({ ...localStorage }).toEqual(before);
  });
  it('rolls back the account and preserves a prior session when the session write fails', () => {
    login('admin', 'admin');
    const before = { ...localStorage };
    const original = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === AUTH_KEY && !failed) {
        failed = true;
        throw new Error('quota');
      }
      return original.call(this, key, value);
    });
    expect(registerCandidate(registration)).toMatchObject({ success: false, fieldErrors: {} });
    expect({ ...localStorage }).toEqual(before);
    expect(isAuthenticated()).toBe(true);
  });
  it('reports user-write failure without persisting a candidate session', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(registerCandidate(registration).error).toContain(REGISTER_STORAGE_ERROR);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
    expect(getSession()).toBeNull();
  });
  it('reports identity generation failure or duplicate ID without any mutation', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unavailable'); });
    expect(registerCandidate(registration)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR, fieldErrors: {} });
    uuid.mockReturnValue('u-admin');
    expect(registerCandidate(registration).success).toBe(false);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
    expect(getSession()).toBeNull();
  });
  it('reports corrupt users and blocked getter without creating accounts', () => {
    localStorage.setItem(USERS_KEY, '{bad');
    expect(registerCandidate(registration)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR, fieldErrors: {} });
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(registerCandidate(registration)).toEqual({ success: false, error: REGISTER_STORAGE_ERROR, fieldErrors: {} });
  });
});

describe('logout', () => {
  it('removes only local auth, retains unrelated storage, and permits login again', () => {
    localStorage.setItem('hirehub_theme', 'dark');
    login('admin', 'admin');
    const users = localStorage.getItem(USERS_KEY);
    expect(logout()).toEqual({ success: true, error: '' });
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(localStorage.getItem(USERS_KEY)).toBe(users);
    expect(isAuthenticated()).toBe(false);
    expect(login('admin', 'admin').success).toBe(true);
  });
  it('succeeds idempotently with an absent session', () => {
    expect(logout()).toEqual({ success: true, error: '' });
    expect(logout()).toEqual({ success: true, error: '' });
    expect(getSession()).toBeNull();
  });
  it('retains validated session when removal fails and allows retry after recovery', () => {
    login('admin', 'admin');
    const session = getSession();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(logout()).toEqual({ success: false, error: LOGOUT_STORAGE_ERROR });
    expect(getSession()).toEqual(session);
    expect(isAuthenticated()).toBe(true);
    remove.mockRestore();
    expect(logout().success).toBe(true);
    expect(getSession()).toBeNull();
  });
  it('reports inaccessible localStorage getter', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(logout()).toEqual({ success: false, error: LOGOUT_STORAGE_ERROR });
  });
});
