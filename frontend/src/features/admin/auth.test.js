/** Verify exact demo credentials and all browser storage lifecycle branches. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  AUTH_KEY, INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, LOGOUT_STORAGE_ERROR,
  isAuthenticated, login, logout,
} from './auth';

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('isAuthenticated', () => {
  it('fails closed when the session is absent', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it.each(['false', '', 'TRUE', 'True', '1', ' true ', 'null', '{}', 'admin'])('rejects stored value %j', (value) => {
    sessionStorage.setItem(AUTH_KEY, value);
    expect(isAuthenticated()).toBe(false);
  });

  it('requeries the session after every state change rather than caching', () => {
    expect(isAuthenticated()).toBe(false);
    sessionStorage.setItem(AUTH_KEY, 'true');
    expect(isAuthenticated()).toBe(true);
    sessionStorage.setItem(AUTH_KEY, 'false');
    expect(isAuthenticated()).toBe(false);
    sessionStorage.setItem(AUTH_KEY, 'true');
    expect(isAuthenticated()).toBe(true);
    sessionStorage.removeItem(AUTH_KEY);
    expect(isAuthenticated()).toBe(false);
  });

  it('fails closed when getItem throws, even with a stored session', () => {
    sessionStorage.setItem(AUTH_KEY, 'true');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(isAuthenticated()).toBe(false);
  });

  it('fails closed when the sessionStorage getter is unavailable', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(isAuthenticated()).toBe(false);
  });
});

describe('login', () => {
  it('writes only the exact session key and authenticates admin/admin', () => {
    expect(login('admin', 'admin')).toEqual({ success: true, error: '' });
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(isAuthenticated()).toBe(true);
  });

  it.each([
    ['wrong', 'admin'], ['admin', 'wrong'], ['wrong', 'wrong'],
    ['', ''], ['', 'admin'], ['admin', ''], ['Admin', 'admin'],
    ['admin', 'Admin'], [' admin', 'admin'], ['admin', 'admin '],
    [undefined, undefined], [null, null], [123, 123], [{}, []],
  ])('rejects credentials %j / %j without granting access', (username, password) => {
    expect(login(username, password)).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('does not touch storage for invalid credentials even when storage is blocked', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(login('wrong', 'wrong')).toEqual({ success: false, error: INVALID_CREDENTIALS });
    expect(write).not.toHaveBeenCalled();
    expect(isAuthenticated()).toBe(false);
  });

  it('returns an actionable error without access when a session write throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('reports failure when the sessionStorage getter throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(login('admin', 'admin')).toEqual({ success: false, error: LOGIN_STORAGE_ERROR });
    expect(isAuthenticated()).toBe(false);
  });
});

describe('logout', () => {
  it('removes the session, retains unrelated storage, and permits login again', () => {
    sessionStorage.setItem('unrelated', 'keep');
    login('admin', 'admin');
    expect(logout()).toEqual({ success: true, error: '' });
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
    expect(isAuthenticated()).toBe(false);
    expect(login('admin', 'admin').success).toBe(true);
    expect(isAuthenticated()).toBe(true);
  });

  it('succeeds idempotently when the session is already absent', () => {
    expect(logout()).toEqual({ success: true, error: '' });
    expect(logout()).toEqual({ success: true, error: '' });
    expect(isAuthenticated()).toBe(false);
  });

  it('retains the session and reports failure when removal throws', () => {
    login('admin', 'admin');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(logout()).toEqual({ success: false, error: LOGOUT_STORAGE_ERROR });
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(isAuthenticated()).toBe(true);
    remove.mockRestore();
    expect(logout().success).toBe(true);
    expect(isAuthenticated()).toBe(false);
  });

  it('reports failure when sessionStorage is unavailable', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(logout()).toEqual({ success: false, error: LOGOUT_STORAGE_ERROR });
  });
});
